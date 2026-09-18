import { create } from 'zustand'
import type { PlaybackRate } from '@/lib/constants'
import type { LoopMode } from '@/lib/preferences'
import { nextLoopMode, setLoopMode as persistLoopMode } from '@/lib/preferences'
import { LISTEN_SLUG, type ColumnSlug } from '@/types/column'
import type { PlaylistItem } from '@/lib/audio/buildColumnPlaylist'
import { shuffleArray } from '@/lib/shuffle'
import { useUiStore } from '@/stores/uiStore'
import { unlockAudioEl } from '@/lib/audio/globalAudioEl'

/**
 * Start the audio element inside the tap that asked for playback.
 *
 * Column Play, Listen's Play all and the queue used to reach play() only after
 * an await, which iOS refuses unless the element was already unlocked. This
 * runs synchronously at the top of those actions. It only touches a paused
 * element, and the loadRequest bump makes the player load the real source
 * again afterwards.
 */
function primeForTap() {
  unlockAudioEl()
}

function focusQueueButton() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.player-bar-queue')?.focus()
  })
}

/**
 * Where the queue came from. 'listen' is a Listen playlist and nothing else.
 *
 * THE LISTEN-INTO-WRITE BLEED (18 Sept, Owen: "after listening to a playlist,
 * songs on Write started playing"). Listen used to queue its playlist through
 * setPlaylist, which labelled it 'column' with the first track's columnSlug as
 * the active column. When the last track ended, the column fallbacks ran:
 * playAdjacentColumn('next') found no '__listen__' column, started from the
 * top and played the first board section; a Listen track that also lives on
 * the board made it play the next board section instead, and Loop section
 * replayed that board column. A Listen queue now has its own source, and the
 * end-of-queue logic (advanceAtEnd) never leaves it.
 */
export type PlaylistSource = 'column' | 'favourites' | 'listen'
export type FavouritesScope = 'project' | 'library'

interface PlayerState {
  activeColumnId: ColumnSlug | null
  playlistSource: PlaylistSource | null
  favouritesScope: FavouritesScope | null
  favouritesShuffle: boolean
  playlist: PlaylistItem[]
  currentIndex: number
  playbackRate: PlaybackRate
  isPlaying: boolean
  buffering: boolean
  progress: number
  currentSongId: string | null
  currentVersionId: string | null
  pendingSeekMs: number | null
  expanded: boolean
  queueOpen: boolean
  queueFocusIndex: number
  queueKeyboardActive: boolean
  loopMode: LoopMode
  /** Bumped on every explicit play tap so the player reloads its source. */
  loadRequest: number
  /** Short plain line shown in the player when a take cannot play here. */
  playbackNotice: string | null
  setPlaybackNotice: (notice: string | null) => void
  setExpanded: (expanded: boolean) => void
  setQueueOpen: (open: boolean) => void
  setQueueFocusIndex: (index: number) => void
  toggleQueueOpen: () => void
  jumpToQueueIndex: (index: number, options?: { keepFocus?: boolean }) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  shuffleQueue: () => void
  playNextInQueue: () => void
  playPreviousInQueue: () => void
  playQueueFromStart: () => void
  playQueueFromEnd: () => void
  queueRepeat: boolean
  toggleQueueRepeat: () => void
  setLoopMode: (mode: LoopMode) => void
  cycleLoopMode: () => void
  toggleExpanded: () => void
  setPlaylist: (
    columnSlug: ColumnSlug,
    playlist: PlaylistItem[],
    startIndex?: number,
    versionId?: string,
  ) => void
  playAtVersion: (columnSlug: ColumnSlug, songId: string, versionId: string) => Promise<void>
  playSongAtTimestamp: (
    columnSlug: ColumnSlug,
    songId: string,
    versionId: string,
    timestampMs: number,
  ) => Promise<void>
  clearPendingSeek: () => void
  setPlaybackRate: (rate: PlaybackRate) => void
  setPlaying: (playing: boolean) => void
  setBuffering: (buffering: boolean) => void
  setProgress: (progress: number) => void
  playNextInColumn: () => PlaylistItem | null
  playPreviousInColumn: () => PlaylistItem | null
  playColumn: (columnSlug: ColumnSlug) => Promise<boolean>
  playFavourites: (
    scope: FavouritesScope,
    startIndex?: number,
    versionId?: string,
    shuffle?: boolean,
  ) => Promise<boolean>
  playAdjacentColumn: (direction: 'prev' | 'next') => Promise<boolean>
  playBoardFromStart: () => Promise<boolean>
  /**
   * Play a Listen playlist. Call it inside the tap. Only these items ever
   * play; at the end it stops, or starts the same playlist again when loop
   * is on.
   */
  playListen: (
    items: PlaylistItem[],
    startIndex?: number,
    versionId?: string,
    seekMs?: number | null,
  ) => void
  /**
   * The current track finished. Moves on without ever crossing between Listen
   * and the board. Returns true when something new starts.
   */
  advanceAtEnd: () => Promise<boolean>
  /**
   * A gapless handoff already started the next track on the player's second
   * element. Move the queue on to it without asking the player to load
   * anything. `index` must be what peekNextAtEnd said; anything else is
   * refused and the normal end-of-track path takes over.
   */
  advanceGapless: (index: number, versionId: string) => boolean
  stop: () => void
}

/**
 * What advanceAtEnd will play next, when it can be known ahead of time: the
 * next item in the queue, or for a looping Listen playlist its first item.
 * The player preloads this on its second element for a gapless join.
 *
 * Null where the answer needs async work or leaves the queue (the end of a
 * board section moves to the next section; favourites rebuild their list;
 * repeat-one replays in place). Those keep the ordinary path. Never crosses
 * between Listen and the board: it only ever returns an item of `playlist`.
 */
export function peekNextAtEnd(
  state: Pick<PlayerState, 'playlist' | 'currentIndex' | 'playlistSource' | 'loopMode' | 'queueRepeat'>,
): { index: number; item: PlaylistItem } | null {
  if (state.queueRepeat) return null
  const nextIndex = state.currentIndex + 1
  const next = state.playlist[nextIndex]
  if (next) return { index: nextIndex, item: next }
  if (state.playlistSource === 'listen' && state.loopMode !== 'off' && state.playlist[0]) {
    return { index: 0, item: state.playlist[0] }
  }
  return null
}

function syncPlaybackColumnForSong(
  songId: string,
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void,
) {
  // A Listen queue never points the board at a column or scrolls it.
  if (get().playlistSource === 'listen') return
  void (async () => {
    const { getSong } = await import('@/db/repositories/boardRepo')
    const song = await getSong(songId)
    if (!song) return
    if (get().playlistSource === 'listen' || song.columnSlug === LISTEN_SLUG) return
    if (song.columnSlug === get().activeColumnId) return
    set({ activeColumnId: song.columnSlug })
    useUiStore.getState().requestColumnScroll(song.columnSlug)
  })()
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  activeColumnId: null,
  playlistSource: null,
  favouritesScope: null,
  favouritesShuffle: false,
  playlist: [],
  currentIndex: 0,
  playbackRate: 1,
  isPlaying: false,
  buffering: false,
  progress: 0,
  currentSongId: null,
  currentVersionId: null,
  pendingSeekMs: null,
  expanded: false,
  queueOpen: false,
  queueFocusIndex: 0,
  queueKeyboardActive: false,
  queueRepeat: false,
  loopMode: 'off',
  loadRequest: 0,
  playbackNotice: null,

  setPlaybackNotice: (notice) => set({ playbackNotice: notice }),

  setLoopMode: (mode) => {
    set({ loopMode: mode })
    void persistLoopMode(mode)
  },

  cycleLoopMode: () => {
    const next = nextLoopMode(get().loopMode)
    get().setLoopMode(next)
  },

  setPlaylist: (columnSlug, playlist, startIndex = 0, versionId) => {
    const item = playlist[startIndex]
    primeForTap()
    set({
      loadRequest: get().loadRequest + 1,
      playbackNotice: null,
      activeColumnId: columnSlug,
      // A queue labelled with Listen's slug is a Listen queue, whoever built it.
      playlistSource: columnSlug === LISTEN_SLUG ? 'listen' : 'column',
      favouritesScope: null,
      playlist,
      currentIndex: startIndex,
      currentSongId: item?.songId ?? null,
      currentVersionId: versionId ?? item?.audioVersionId ?? null,
      progress: 0,
    })
  },

  playAtVersion: async (columnSlug, songId, versionId) => {
    // Set playing state eagerly so ColumnPlayerBar starts loading the audio
    // source before the async playlist build completes. This is critical on
    // iOS where audio.play() must be called as close to the user gesture as
    // possible (gesture context expires after ~1 s across await boundaries).
    set({
      activeColumnId: columnSlug,
      playlistSource: 'column',
      favouritesScope: null,
      currentSongId: songId,
      currentVersionId: versionId,
      pendingSeekMs: null,
      progress: 0,
      isPlaying: true,
      buffering: true,
      playbackNotice: null,
      loadRequest: get().loadRequest + 1,
    })
    const { buildColumnPlaylist } = await import('@/lib/audio/buildColumnPlaylist')
    const playlist = await buildColumnPlaylist(columnSlug)
    const index = playlist.findIndex((p) => p.songId === songId)
    // Guard: only apply if the user hasn't tapped a different song while we awaited
    if (get().currentSongId === songId) {
      set({ playlist, currentIndex: Math.max(0, index) })
    }
  },

  playSongAtTimestamp: async (columnSlug, songId, versionId, timestampMs) => {
    const { buildColumnPlaylist } = await import('@/lib/audio/buildColumnPlaylist')
    let playlist = await buildColumnPlaylist(columnSlug)
    let index = playlist.findIndex((p) => p.songId === songId)
    if (index < 0) {
      playlist = [{ songId, audioVersionId: versionId, songTitle: '' }]
      index = 0
    }
    set({
      activeColumnId: columnSlug,
      playlistSource: 'column',
      favouritesScope: null,
      playlist,
      currentIndex: index,
      currentSongId: songId,
      currentVersionId: versionId,
      pendingSeekMs: Math.max(0, timestampMs),
      progress: 0,
      isPlaying: true,
      expanded: true,
      playbackNotice: null,
      loadRequest: get().loadRequest + 1,
    })
  },

  clearPendingSeek: () => set({ pendingSeekMs: null }),

  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  setPlaying: (playing) => set({ isPlaying: playing, ...(playing ? {} : { buffering: false }) }),
  setBuffering: (buffering) => set({ buffering }),
  setProgress: (progress) => set({ progress }),

  setExpanded: (expanded) => set({ expanded }),

  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),

  setQueueOpen: (open) => {
    if (open) {
      const { currentIndex } = get()
      set({ queueOpen: true, queueFocusIndex: currentIndex, queueKeyboardActive: true })
      return
    }
    set({ queueOpen: false, queueKeyboardActive: false })
    focusQueueButton()
  },

  setQueueFocusIndex: (index) => {
    const { playlist } = get()
    if (playlist.length === 0) return
    const clamped = Math.max(0, Math.min(index, playlist.length - 1))
    set({ queueFocusIndex: clamped, queueKeyboardActive: true })
  },

  toggleQueueOpen: () => {
    const { queueOpen, currentIndex } = get()
    if (!queueOpen) {
      set({ queueOpen: true, queueFocusIndex: currentIndex, queueKeyboardActive: true })
      return
    }
    set({ queueOpen: false, queueKeyboardActive: false })
    focusQueueButton()
  },

  jumpToQueueIndex: (index, options) => {
    const { playlist, queueFocusIndex } = get()
    const item = playlist[index]
    if (!item) return

    primeForTap()
    set({
      loadRequest: get().loadRequest + 1,
      playbackNotice: null,
      currentIndex: index,
      queueFocusIndex: options?.keepFocus ? queueFocusIndex : index,
      queueKeyboardActive: true,
      currentSongId: item.songId,
      currentVersionId: item.audioVersionId,
      progress: 0,
      isPlaying: true,
    })
    syncPlaybackColumnForSong(item.songId, get, set)
  },

  moveQueueItem: (fromIndex, toIndex) => {
    const { playlist, currentIndex, queueFocusIndex } = get()
    if (fromIndex < 0 || fromIndex >= playlist.length) return
    if (toIndex < 0 || toIndex >= playlist.length) return
    if (fromIndex === toIndex) return

    const next = [...playlist]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)

    let newCurrentIndex = currentIndex
    if (fromIndex === currentIndex) {
      newCurrentIndex = toIndex
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      newCurrentIndex = currentIndex - 1
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      newCurrentIndex = currentIndex + 1
    }

    let newFocusIndex = queueFocusIndex
    if (fromIndex === queueFocusIndex) {
      newFocusIndex = toIndex
    } else if (fromIndex < queueFocusIndex && toIndex >= queueFocusIndex) {
      newFocusIndex = queueFocusIndex - 1
    } else if (fromIndex > queueFocusIndex && toIndex <= queueFocusIndex) {
      newFocusIndex = queueFocusIndex + 1
    }

    set({ playlist: next, currentIndex: newCurrentIndex, queueFocusIndex: newFocusIndex })
  },

  clearQueue: () => {
    get().stop()
  },

  shuffleQueue: () => {
    const { playlist, currentSongId, currentVersionId } = get()
    if (playlist.length <= 1) return

    const shuffled = shuffleArray(playlist)
    let currentIndex = shuffled.findIndex(
      (item) => item.songId === currentSongId && item.audioVersionId === currentVersionId,
    )
    if (currentIndex < 0) currentIndex = 0

    set({ playlist: shuffled, currentIndex, queueFocusIndex: currentIndex })
  },

  playNextInQueue: () => {
    get().playNextInColumn()
  },

  playPreviousInQueue: () => {
    get().playPreviousInColumn()
  },

  playQueueFromStart: () => {
    get().jumpToQueueIndex(0)
  },

  playQueueFromEnd: () => {
    const { playlist } = get()
    if (playlist.length === 0) return
    get().jumpToQueueIndex(playlist.length - 1)
  },

  toggleQueueRepeat: () => set((state) => ({ queueRepeat: !state.queueRepeat })),

  removeFromQueue: (index) => {
    const { playlist, currentIndex, queueFocusIndex, isPlaying } = get()
    if (index < 0 || index >= playlist.length) return

    if (playlist.length <= 1) {
      get().stop()
      set({ queueOpen: false })
      return
    }

    const next = playlist.filter((_, itemIndex) => itemIndex !== index)
    let newIndex = currentIndex
    if (index < currentIndex) {
      newIndex = currentIndex - 1
    } else if (index === currentIndex) {
      newIndex = Math.min(index, next.length - 1)
    }

    const item = next[newIndex]
    let newFocusIndex = queueFocusIndex
    if (index < queueFocusIndex) {
      newFocusIndex = queueFocusIndex - 1
    } else if (index === queueFocusIndex) {
      newFocusIndex = Math.min(index, next.length - 1)
    }

    set({
      playlist: next,
      currentIndex: newIndex,
      queueFocusIndex: newFocusIndex,
      currentSongId: item.songId,
      currentVersionId: item.audioVersionId,
      progress: index === currentIndex ? 0 : get().progress,
      isPlaying: index === currentIndex ? isPlaying : get().isPlaying,
    })
  },

  playNextInColumn: () => {
    const { playlist, currentIndex } = get()
    const nextIndex = currentIndex + 1
    if (nextIndex >= playlist.length) {
      set({ isPlaying: false, progress: 0 })
      return null
    }
    const next = playlist[nextIndex]
    set({
      currentIndex: nextIndex,
      queueFocusIndex: get().queueOpen ? nextIndex : get().queueFocusIndex,
      currentSongId: next.songId,
      currentVersionId: next.audioVersionId,
      progress: 0,
      isPlaying: true,
    })
    syncPlaybackColumnForSong(next.songId, get, set)
    return next
  },

  playPreviousInColumn: () => {
    const { playlist, currentIndex, progress } = get()
    if (progress > 0.03 && currentIndex >= 0) {
      set({ progress: 0, isPlaying: true })
      return playlist[currentIndex] ?? null
    }

    const prevIndex = currentIndex - 1
    if (prevIndex < 0) {
      set({ progress: 0, isPlaying: true })
      return playlist[currentIndex] ?? null
    }

    const prev = playlist[prevIndex]
    set({
      currentIndex: prevIndex,
      queueFocusIndex: get().queueOpen ? prevIndex : get().queueFocusIndex,
      currentSongId: prev.songId,
      currentVersionId: prev.audioVersionId,
      progress: 0,
      isPlaying: true,
    })
    syncPlaybackColumnForSong(prev.songId, get, set)
    return prev
  },

  playColumn: async (columnSlug) => {
    // The board only ever plays board songs. Listen has no column to play.
    if (columnSlug === LISTEN_SLUG) return false
    primeForTap()
    const { buildColumnPlaylist } = await import('@/lib/audio/buildColumnPlaylist')
    const playlist = await buildColumnPlaylist(columnSlug)
    if (!playlist.length) {
      // The tap may have borrowed the element; reload whatever was loaded.
      set({ loadRequest: get().loadRequest + 1 })
      return false
    }

    set({
      activeColumnId: columnSlug,
      playlistSource: 'column',
      favouritesScope: null,
      playlist,
      currentIndex: 0,
      currentSongId: playlist[0].songId,
      currentVersionId: playlist[0].audioVersionId,
      pendingSeekMs: null,
      progress: 0,
      isPlaying: true,
      expanded: false,
      playbackNotice: null,
      loadRequest: get().loadRequest + 1,
    })
    return true
  },

  playFavourites: async (scope, startIndex = 0, versionId, shuffle = false) => {
    primeForTap()
    const { buildFavouritesPlaylist } = await import('@/lib/audio/buildFavouritesPlaylist')
    const { getSong } = await import('@/db/repositories/boardRepo')
    const playlist = await buildFavouritesPlaylist(scope, { shuffle })
    if (!playlist.length || startIndex >= playlist.length) {
      set({ loadRequest: get().loadRequest + 1 })
      return false
    }

    const item = playlist[startIndex]
    const song = await getSong(item.songId)
    if (!song) {
      set({ loadRequest: get().loadRequest + 1 })
      return false
    }

    set({
      activeColumnId: song.columnSlug,
      playlistSource: 'favourites',
      favouritesScope: scope,
      favouritesShuffle: shuffle,
      playlist,
      currentIndex: startIndex,
      currentSongId: item.songId,
      currentVersionId: versionId ?? item.audioVersionId,
      pendingSeekMs: null,
      progress: 0,
      isPlaying: true,
      expanded: false,
      playbackNotice: null,
      loadRequest: get().loadRequest + 1,
    })
    useUiStore.getState().requestColumnScroll(song.columnSlug)
    return true
  },

  playAdjacentColumn: async (direction) => {
    const { getColumns } = await import('@/db/repositories/boardRepo')
    const columns = await getColumns()
    if (!columns.length) return false

    const { activeColumnId, playlistSource } = get()
    // Moving to the next board section only makes sense from the board.
    if (playlistSource === 'listen') return false
    const currentIndex = activeColumnId
      ? columns.findIndex((column) => column.slug === activeColumnId)
      : -1
    const startIndex = currentIndex < 0 ? (direction === 'next' ? -1 : columns.length) : currentIndex

    for (
      let index = startIndex + (direction === 'next' ? 1 : -1);
      index >= 0 && index < columns.length;
      index += direction === 'next' ? 1 : -1
    ) {
      const slug = columns[index].slug
      useUiStore.getState().requestColumnScroll(slug)
      if (await get().playColumn(slug)) return true
    }

    return false
  },

  playBoardFromStart: async () => {
    const { getColumns } = await import('@/db/repositories/boardRepo')
    const columns = await getColumns()
    for (const column of columns) {
      if (column.slug === LISTEN_SLUG) continue
      useUiStore.getState().requestColumnScroll(column.slug)
      if (await get().playColumn(column.slug)) return true
    }
    return false
  },

  playListen: (items, startIndex = 0, versionId, seekMs = null) => {
    const item = items[startIndex]
    if (!item) return
    primeForTap()
    set({
      loadRequest: get().loadRequest + 1,
      playbackNotice: null,
      activeColumnId: LISTEN_SLUG,
      playlistSource: 'listen',
      favouritesScope: null,
      favouritesShuffle: false,
      playlist: items,
      currentIndex: startIndex,
      currentSongId: item.songId,
      currentVersionId: versionId ?? item.audioVersionId,
      pendingSeekMs: seekMs,
      progress: 0,
      isPlaying: true,
    })
  },

  advanceAtEnd: async () => {
    if (get().playNextInColumn()) {
      set({ isPlaying: true })
      return true
    }

    const { playlistSource, playlist, loopMode, favouritesScope, favouritesShuffle, activeColumnId } = get()

    if (playlistSource === 'listen') {
      // Loop on (either setting) goes round the same playlist. Otherwise stop.
      const first = playlist[0]
      if (loopMode !== 'off' && first) {
        set({
          loadRequest: get().loadRequest + 1,
          currentIndex: 0,
          queueFocusIndex: get().queueOpen ? 0 : get().queueFocusIndex,
          currentSongId: first.songId,
          currentVersionId: first.audioVersionId,
          pendingSeekMs: null,
          progress: 0,
          isPlaying: true,
        })
        return true
      }
      set({ isPlaying: false })
      return false
    }

    if (playlistSource === 'favourites' && favouritesScope) {
      if (loopMode === 'section' || loopMode === 'board') {
        if (await get().playFavourites(favouritesScope, 0, undefined, favouritesShuffle)) return true
      }
      set({ isPlaying: false })
      return false
    }

    if (loopMode === 'section' && activeColumnId) {
      if (await get().playColumn(activeColumnId)) return true
    }
    if (await get().playAdjacentColumn('next')) return true
    if (loopMode === 'board' && (await get().playBoardFromStart())) return true

    set({ isPlaying: false })
    return false
  },

  advanceGapless: (index, versionId) => {
    const next = peekNextAtEnd(get())
    if (!next || next.index !== index || next.item.audioVersionId !== versionId) return false
    set({
      currentIndex: index,
      queueFocusIndex: get().queueOpen ? index : get().queueFocusIndex,
      currentSongId: next.item.songId,
      currentVersionId: next.item.audioVersionId,
      pendingSeekMs: null,
      progress: 0,
      isPlaying: true,
    })
    syncPlaybackColumnForSong(next.item.songId, get, set)
    return true
  },

  stop: () =>
    set({
      isPlaying: false,
      progress: 0,
      expanded: false,
      queueOpen: false,
      queueRepeat: false,
      activeColumnId: null,
      playlistSource: null,
      favouritesScope: null,
      favouritesShuffle: false,
      playlist: [],
      currentIndex: 0,
      currentSongId: null,
      currentVersionId: null,
      pendingSeekMs: null,
    }),
}))
