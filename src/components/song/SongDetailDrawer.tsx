import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { duplicateSong } from '@/db/repositories/audioRepo'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { formatDuration } from '@/lib/audio-utils'
import { recordEvent } from '@/lib/analytics'
import { getSong, updateSong } from '@/db/repositories/boardRepo'
import { markFeedbackSeen } from '@/db/repositories/shareFeedbackRepo'
import { SongStageSelect } from './SongStageSelect'
import { SongProjectSelect } from './SongProjectSelect'
import { scheduleFlush } from '@/sync/syncEngine'
import { useUiStore } from '@/stores/uiStore'
import { LyricsEditor } from './LyricsEditor'
import { SongMetaFields } from './SongMetaFields'
import { NotesEditor } from './NotesEditor'
import { ExternalLinks } from './ExternalLinks'
import { AudioVersionStack } from './AudioVersionStack'
import { MergeSongPicker } from './MergeSongPicker'
import { AddVersionButton } from './AddVersionButton'
import { FavouriteButton } from './FavouriteButton'
import { SongTagsEditor } from './SongTagsEditor'
import { SongComments } from './SongComments'
import { SongSharePanel } from './SongSharePanel'
/* board.css first, then the panel's own sheet, so the panel's rules land
   after the older drawer rules in the cascade in dev and in the build. */
import '@/styles/board.css'
import '@/styles/song-panel.css'

/* Ask for the faces the panel uses before it first opens. The title serif is
   preloaded for the board, but the mono eyebrows and the heavier sans weights
   were only fetched the first time a song was opened, so the first open (and
   on a slow phone the second) painted in the fallback font and then jumped. */
if (typeof document !== 'undefined' && 'fonts' in document) {
  for (const face of ['400 12px "DM Mono"', '500 14px "Bricolage Grotesque"', '600 14px "Bricolage Grotesque"', '400 40px "Instrument Serif"']) {
    void document.fonts.load(face).catch(() => undefined)
  }
}

export function SongDetailDrawer({ readOnly = false }: { readOnly?: boolean }) {
  /* Selectors, not the whole store: without them the drawer re-rendered on
     every UI change, including the drag state that updates while a card is
     being dragged. */
  const selectedSongId = useUiStore((state) => state.selectedSongId)
  const drawerOpen = useUiStore((state) => state.drawerOpen)
  const closeDrawer = useUiStore((state) => state.closeDrawer)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  /* The title being typed, tied to the song it belongs to. Seeding this from
     an effect meant the first frame of every open showed an empty field (the
     "Song name" placeholder) before the real title arrived a frame later. */
  const [titleDraft, setTitleDraft] = useState<{ id: string; value: string } | null>(null)
  /**
   * A callback ref rather than useRef, because the input does not exist when
   * the request to focus it arrives: the drawer returns null until
   * useLiveQuery has fetched the song, so an effect keyed on a ref object
   * finds null in that first commit and never runs again. This way the effect
   * re-runs the moment the field mounts.
   */
  const [titleEl, setTitleEl] = useState<HTMLInputElement | null>(null)

  /**
   * Opened from the "Name it" button on a card: put the cursor in the title
   * and select what is there, so typing replaces the filename rather than
   * appending to it. Someone who came here to rename should not have to click
   * the field they came for.
   */
  const focusTitleNonce = useUiStore((s) => s.drawerFocusTitleNonce)
  const [pendingTitleFocus, setPendingTitleFocus] = useState(0)
  useEffect(() => {
    if (focusTitleNonce) setPendingTitleFocus(focusTitleNonce)
  }, [focusTitleNonce])

  useEffect(() => {
    if (!pendingTitleFocus || !titleEl) return
    // After the drawer's open transition, otherwise the focus scrolls a
    // half-positioned panel. The flag is cleared inside the timeout, not
    // beside it: clearing it early re-renders, and the cleanup below would
    // cancel the very timeout that is meant to do the work.
    const id = window.setTimeout(() => {
      titleEl.focus()
      titleEl.select()
      setPendingTitleFocus(0)
    }, 220)
    return () => window.clearTimeout(id)
  }, [pendingTitleFocus, titleEl])
  const song = useLiveQuery(
    () => (selectedSongId ? getSong(selectedSongId) : undefined),
    [selectedSongId],
  )

  useEffect(() => {
    if (!drawerOpen) { setMergeOpen(false); return }
    if (selectedSongId) void markFeedbackSeen(selectedSongId)
  }, [drawerOpen, selectedSongId])

  // Preload audio URLs as soon as the drawer opens so getCachedLocalUrl()
  // returns synchronously when the user taps play — making play() callable
  // inside the gesture handler with no await before it (required by iOS).
  useEffect(() => {
    if (!drawerOpen || !selectedSongId) return
    void (async () => {
      const versions = await db.audioVersions
        .where('songId').equals(selectedSongId).sortBy('sortOrder')
      for (const v of versions) {
        void resolvePlaybackUrl(v.localBlobId, v.storagePath)
      }
    })()
  }, [drawerOpen, selectedSongId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      /* Anything inside the drawer that opens on top of it marks itself with
         data-drawer-layer, and closes itself on Escape first. This used to
         name one specific overlay by class, so every other inner layer, the
         share popover included, closed the whole drawer from underneath and
         lost your place on the card. */
      if (document.querySelector('[data-drawer-layer]')) return
      closeDrawer()
    }
    if (drawerOpen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  /* Only "is this song the one loaded", as a boolean. The drawer used to take
     the whole player store, progress included, so the entire open drawer
     (lyrics, comments, tags, every take's waveform) re-rendered on every
     playback tick. That was the "playback in the drawer is laggy" report.
     The ticking parts now live in DrawerMiniPlayer, which is small. */
  const isThisSongPlaying = usePlayerStore((state) => state.currentSongId === (song?.id ?? ''))
  const currentVersion = useLiveQuery(async () => {
    if (!isThisSongPlaying || !song) return undefined
    const versions = await db.audioVersions.where('songId').equals(song.id).sortBy('sortOrder')
    return versions[0]
  }, [isThisSongPlaying, song?.id])

  /* Swipe down to close on a phone, from the top bar ONLY. The bar sits
     outside the scrolling body, so no scroll of the lyrics or comments can
     ever reach this (Owen, 18 Sept: scrolling back up made the song vanish).
     The drag has to be clearly downward and mostly vertical. */
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dy = e.changedTouches[0].clientY - start.y
    const dx = Math.abs(e.changedTouches[0].clientX - start.x)
    if (dy > 90 && dy > dx * 2) closeDrawer()
  }

  if (!drawerOpen || !song) return null

  const saveTitle = async (title: string) => {
    await updateSong(song.id, { title })
    // Naming is the cheapest proxy for caring about a memo.
    void recordEvent('song_renamed')
    scheduleFlush()
  }

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const result = await duplicateSong(song.id)
      scheduleFlush()
      if (result.clipsSkipped > 0) {
        alert(
          `Copied "${result.song.title}" with ${result.clipsCopied} take${
            result.clipsCopied === 1 ? '' : 's'
          }. ${result.clipsSkipped} cloud-only take${
            result.clipsSkipped === 1 ? ' was' : 's were'
          } skipped. Download them first from Settings.`,
        )
      }
      useUiStore.getState().openDrawer(result.song.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not duplicate song')
    } finally {
      setDuplicating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${song.title}" forever? Every take and audio file goes now. This cannot be undone.`)) return
    usePlayerStore.getState().stop()
    const { deleteSongForever } = await import('@/db/repositories/trashRepo')
    await deleteSongForever(song.id)
    scheduleFlush()
    closeDrawer()
  }

  const titleValue = titleDraft?.id === song.id ? titleDraft.value : song.title

  const commitTitle = () => {
    const next = titleValue.trim()
    setTitleDraft(null)
    if (next && next !== song.title) void saveTitle(next)
  }

  return (
    <div
      className="sp-overlay"
      role="button"
      tabIndex={-1}
      aria-label="Close"
      onClick={closeDrawer}
      onKeyDown={(e) => {
        // Only the overlay itself. Escape inside the panel is handled by the
        // window listener above, which knows to leave open popovers first.
        if (e.key === 'Escape' && e.target === e.currentTarget) closeDrawer()
      }}
    >
      <div
        className="sp"
        role="dialog"
        aria-modal="true"
        aria-label={song.title || 'Song'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The top bar never scrolls, so Close is always in reach, on a
            phone and on a computer. */}
        <div className="sp-bar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <span className="sp-grab" aria-hidden="true" />
          <span className="sp-eyebrow sp-bar-eyebrow">Song</span>
          <div className="sp-bar-actions">
            {!readOnly && <SongSharePanel songId={song.id} />}
            <button type="button" className="sp-close" onClick={closeDrawer}>
              Close
            </button>
          </div>
        </div>

        <div className="sp-scroll">
          <header className="sp-hero">
            <div className="sp-title-row">
              {readOnly ? (
                <h2 className="sp-title">{song.title}</h2>
              ) : (
                <input
                  ref={setTitleEl}
                  value={titleValue}
                  onChange={(e) => setTitleDraft({ id: song.id, value: e.target.value })}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  className="sp-title"
                  placeholder="Song name"
                  aria-label="Song name"
                />
              )}
              <FavouriteButton
                songId={song.id}
                isFavourite={song.isFavourite ?? false}
                size="drawer"
                className="sp-fav"
              />
            </div>

            <div className="sp-facts">
              <SongStageSelect songId={song.id} columnSlug={song.columnSlug} readOnly={readOnly} />
              <SongProjectSelect
                songId={song.id}
                projectId={song.projectId ?? ''}
                readOnly={readOnly}
              />
            </div>
          </header>

          <section className="sp-section">
            <div className="sp-section-head">
              <span className="sp-eyebrow">Takes</span>
              {!readOnly && (
                <div className="sp-section-actions">
                  <AddVersionButton songId={song.id} />
                  <button
                    type="button"
                    className="song-detail-link"
                    onClick={() => setMergeOpen((v) => !v)}
                  >
                    {mergeOpen ? 'Close merge' : 'Merge with another song'}
                  </button>
                </div>
              )}
            </div>

            {!readOnly && mergeOpen && (
              <MergeSongPicker targetSongId={song.id} onClose={() => setMergeOpen(false)} />
            )}

            <AudioVersionStack songId={song.id} readOnly={readOnly} />

            {/* Comments live directly under the waveform they point at, the
                way they do on SoundCloud. */}
            <SongComments songId={song.id} readOnly={readOnly} />
          </section>

          {readOnly && song.notes ? (
            <section className="sp-section">
              <p className="song-detail-notes">{song.notes}</p>
            </section>
          ) : null}

          {!readOnly && (
            <>
              <section className="sp-section">
                <SongMetaFields song={song} />
              </section>
              <section className="sp-section">
                <SongTagsEditor songId={song.id} initialTags={song.tags ?? []} />
              </section>
              {/* Lyrics above notes: keeping the words with the recording was
                  the most requested thing, notes are the lesser field. */}
              <section className="sp-section">
                <LyricsEditor songId={song.id} initial={song.lyrics ?? null} />
              </section>
              <section className="sp-section">
                <NotesEditor songId={song.id} initialNotes={song.notes} />
              </section>
              <section className="sp-section">
                <ExternalLinks songId={song.id} />
              </section>

              <footer className="sp-foot">
                <button
                  type="button"
                  className="sp-foot-btn"
                  disabled={duplicating}
                  onClick={() => void handleDuplicate()}
                >
                  {duplicating ? 'Duplicating…' : 'Duplicate song'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="sp-foot-btn sp-foot-btn--danger"
                >
                  Delete song
                </button>
              </footer>
            </>
          )}
        </div>

        {isThisSongPlaying && (
          <DrawerMiniPlayer
            label={currentVersion?.label ?? song.title}
            durationMs={currentVersion?.durationMs ?? 0}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The drawer's mini player: the only part of the drawer that has to change on
 * every playback tick, so it is the only part that subscribes to progress.
 */
function DrawerMiniPlayer({ label, durationMs }: { label: string; durationMs: number }) {
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const buffering = usePlayerStore((state) => state.buffering)
  const progress = usePlayerStore((state) => state.progress)
  const setPlaying = usePlayerStore((state) => state.setPlaying)
  const playbackRate = usePlayerStore((state) => state.playbackRate)
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate)

  return (
    <div className="drawer-mini-player">
      <button
        type="button"
        className={`drawer-mini-play${buffering ? ' player-bar-buffering' : ''}`}
        onClick={() => { if (!buffering) setPlaying(!isPlaying) }}
        aria-label={buffering ? 'Loading…' : isPlaying ? 'Pause' : 'Play'}
      >
        {buffering ? <span className="player-bar-spinner" /> : isPlaying ? '❚❚' : '▶'}
      </button>
      <div className="drawer-mini-info">
        <span className="drawer-mini-label">{label}</span>
        <span className="drawer-mini-time">{formatDuration((progress ?? 0) * durationMs)}</span>
      </div>
      <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="drawer-mini-speed" />
    </div>
  )
}
