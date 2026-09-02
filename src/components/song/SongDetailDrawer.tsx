import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { duplicateSong } from '@/db/repositories/audioRepo'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { formatDuration } from '@/lib/audio-utils'
import { recordEvent } from '@/lib/analytics'
import { deleteSong, getSong, updateSong } from '@/db/repositories/boardRepo'
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
import { AddToPlaylistModal } from './AddToPlaylistModal'

export function SongDetailDrawer({ readOnly = false }: { readOnly?: boolean }) {
  const { selectedSongId, drawerOpen, closeDrawer } = useUiStore()
  const [mergeOpen, setMergeOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
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
  const [playlistOpen, setPlaylistOpen] = useState(false)
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
    if (song) setTitleDraft(song.title)
  }, [song?.id, song?.title])

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

  const { currentSongId, isPlaying, buffering, setPlaying, playbackRate, setPlaybackRate, progress } = usePlayerStore()
  const isThisSongPlaying = currentSongId === (song?.id ?? '')
  const currentVersion = useLiveQuery(async () => {
    if (!isThisSongPlaying || !song) return undefined
    const versions = await db.audioVersions.where('songId').equals(song.id).sortBy('sortOrder')
    return versions[0]
  }, [isThisSongPlaying, song?.id])

  // Swipe down to close on mobile
  const touchStartY = useRef(0)
  const onTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - touchStartY.current > 80) closeDrawer()
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
    if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return
    usePlayerStore.getState().stop()
    await deleteSong(song.id)
    scheduleFlush()
    closeDrawer()
  }

  return (
    <div className="song-drawer-overlay" role="button" tabIndex={-1} aria-label="Close" onClick={closeDrawer} onKeyDown={(e) => e.key === 'Escape' && closeDrawer()}>
      <div className="song-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button type="button" className="song-drawer-handle" onClick={closeDrawer} aria-label="Close">
          <span className="song-drawer-handle-pill" />
          <span className="song-drawer-handle-label">✕ Close</span>
        </button>
        <div className="scp-header">
          {readOnly ? (
            <h2 className="scp-title-input">{song.title}</h2>
          ) : (
            <input
              ref={setTitleEl}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft !== song.title) void saveTitle(titleDraft.trim())
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              className="scp-title-input"
              placeholder="Song name"
              aria-label="Song name"
            />
          )}
          <div className="scp-header-actions">
            <FavouriteButton
              songId={song.id}
              isFavourite={song.isFavourite ?? false}
              size="drawer"
            />
            <SongStageSelect
              songId={song.id}
              columnSlug={song.columnSlug}
              readOnly={readOnly}
            />
            {/* "One link to your producer" is the second thing the landing
                page sells, and it used to be the eighth item down a scrolling
                drawer, below the lyrics box, with its own options panel
                off-screen again underneath that. It is a header action now,
                opening as a popover anchored to its own button. */}
            {!readOnly && <SongSharePanel songId={song.id} />}
          </div>
        </div>

        <div className="scp-body">
          <SongProjectSelect
            songId={song.id}
            projectId={song.projectId ?? ''}
            readOnly={readOnly}
          />

          {!readOnly && (
            <div className="flex items-center justify-between">
              <span className="song-detail-label">Audio</span>
              <div className="flex gap-3">
                <AddVersionButton songId={song.id} />
                <button
                  type="button"
                  className="song-detail-link"
                  onClick={() => setMergeOpen((v) => !v)}
                >
                  {mergeOpen ? 'Close merge' : 'Merge with another song'}
                </button>
              </div>
            </div>
          )}

          <AudioVersionStack songId={song.id} readOnly={readOnly} />

          {/* Comments live directly under the waveform they point at, the way
              they do on SoundCloud. A note pinned to 1:07 that sits six
              sections below the audio is not pinned to anything you can see. */}
          <SongComments songId={song.id} readOnly={readOnly} />


          {!readOnly && mergeOpen && (
            <MergeSongPicker targetSongId={song.id} onClose={() => setMergeOpen(false)} />
          )}

          {readOnly && song.notes ? <p className="song-detail-notes">{song.notes}</p> : null}

          {!readOnly && (
            <>
              <SongMetaFields song={song} />
              <SongTagsEditor songId={song.id} initialTags={song.tags ?? []} />
              {/* Lyrics sit ABOVE notes deliberately: across twelve threads
                  keeping the words with the recording was the most requested
                  thing full stop, and notes are the lesser field. */}
              <LyricsEditor songId={song.id} initial={song.lyrics ?? null} />
              <NotesEditor songId={song.id} initialNotes={song.notes} />
              <ExternalLinks songId={song.id} />

              {/* Actions last, and together.
                  "+ Add to playlist" and "Share demo link" used to sit between
                  the notes box and the key/tempo row, so the panel read
                  describe, act, describe again. They are the two things you DO
                  with a song once you have looked at it, so they belong at the
                  end, next to each other. */}
              <div className="song-detail-actions">
                <button
                  type="button"
                  className="song-detail-playlist-btn"
                  onClick={() => setPlaylistOpen(true)}
                >
                  + Add to playlist
                </button>
              </div>
            </>
          )}

          {!readOnly && (
            <div className="mt-4 border-t border-border pt-4 song-detail-footer-actions">
              <button
                type="button"
                className="song-detail-link"
                disabled={duplicating}
                onClick={() => void handleDuplicate()}
              >
                {duplicating ? 'Duplicating…' : 'Duplicate song'}
              </button>
              <button type="button" onClick={() => void handleDelete()} className="song-detail-danger">
                Delete song
              </button>
            </div>
          )}
        </div>

        {playlistOpen && (
          <AddToPlaylistModal songId={song.id} onClose={() => setPlaylistOpen(false)} />
        )}

        {isThisSongPlaying && (
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
              <span className="drawer-mini-label">{currentVersion?.label ?? song.title}</span>
              <span className="drawer-mini-time">{formatDuration((progress ?? 0) * (currentVersion?.durationMs ?? 0))}</span>
            </div>
            <SpeedControl value={playbackRate} onChange={setPlaybackRate} className="drawer-mini-speed" />
          </div>
        )}
      </div>
    </div>
  )
}
