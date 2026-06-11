import { create } from 'zustand'
import type { PlaybackRate } from '@/lib/constants'
import type { LoopMode } from '@/lib/preferences'
import { nextLoopMode, setLoopMode as persistLoopMode } from '@/lib/preferences'
import type { ColumnSlug } from '@/types/column'
import type { PlaylistItem } from '@/lib/audio/buildColumnPlaylist'
import { shuffleArray } from '@/lib/shuffle'
import { useUiStore } from '@/stores/uiStore'

function focusQueueButton() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.player-bar-queue')?.focus()
  })
}

export type PlaylistSource = 'column' | 'favourites'
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
  progress: number
  currentSongId: string | null
  currentVersionId: string | null
  pendingSeekMs: number | null
  expanded: boolean
  queueOpen: boolean
  queueFocusIndex: number
  queueKeyboardActive: boolean
  loopMode: LoopMode
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
  stop: () => void
}

function syncPlaybackColumnForSong(
  songId: string,
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void,
) {
  void (async () => {
    const { getSong } = await import('@/db/repositories/boardRepo')
    const song = await getSong(songId)
    if (!song) return
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
    set({
      activeColumnId: columnSlug,
      playlistSource: 'column',
      favouritesScope: null,
      playlist,
      currentIndex: startIndex,
      currentSongId: item?.songId ?? null,
      currentVersionId: versionId ?? item?.audioVersionId ?? null,
      progress: 0,
    })
  },

  playAtVersion: async (columnSlug, songId, versionId) => {
    const { buildColumnPlaylist } = await import('@/lib/audio/buildColumnPlaylist')
    const playlist = await buildColumnPlaylist(columnSlug)
    const index = playlist.findIndex((p) => p.songId === songId)
    if (index < 0) return
    set({
      activeColumnId: columnSlug,
      playlistSource: 'column',
      favouritesScope: null,
      playlist,
      currentIndex: index,
      currentSongId: songId,
      currentVersionId: versionId,
      pendingSeekMs: null,
      progress: 0,
      isPlaying: true,
    })
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
    })
  },

  clearPendingSeek: () => set({ pendingSeekMs: null }),

  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  setPlaying: (playing) => set({ isPlaying: playing }),

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

    set({
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
    const { buildColumnPlaylist } = await import('@/lib/audio/buildColumnPlaylist')
    const playlist = await buildColumnPlaylist(columnSlug)
    if (!playlist.length) return false

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
    })
    return true
  },

  playFavourites: async (scope, startIndex = 0, versionId, shuffle = false) => {
    const { buildFavouritesPlaylist } = await import('@/lib/audio/buildFavouritesPlaylist')
    const { getSong } = await import('@/db/repositories/boardRepo')
    const playlist = await buildFavouritesPlaylist(scope, { shuffle })
    if (!playlist.length || startIndex >= playlist.length) return false

    const item = playlist[startIndex]
    const song = await getSong(item.songId)
    if (!song) return false

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
    })
    useUiStore.getState().requestColumnScroll(song.columnSlug)
    return true
  },

  playAdjacentColumn: async (direction) => {
    const { getColumns } = await import('@/db/repositories/boardRepo')
    const columns = await getColumns()
    if (!columns.length) return false

    const { activeColumnId } = get()
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
      useUiStore.getState().requestColumnScroll(column.slug)
      if (await get().playColumn(column.slug)) return true
    }
    return false
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
