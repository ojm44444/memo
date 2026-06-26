import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { duplicateSong } from '@/db/repositories/audioRepo'
import { resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import { usePlayerStore } from '@/stores/playerStore'
import { SpeedControl } from '@/components/audio/SpeedControl'
import { formatDuration } from '@/lib/audio-utils'
import { deleteSong, getSong, updateSong } from '@/db/repositories/boardRepo'
import { markFeedbackSeen } from '@/db/repositories/shareFeedbackRepo'
import { SongStageSelect } from './SongStageSelect'
import { SongProjectSelect } from './SongProjectSelect'
import { scheduleFlush } from '@/sync/syncEngine'
import { useUiStore } from '@/stores/uiStore'
import { NotesEditor } from './NotesEditor'
import { ExternalLinks } from './ExternalLinks'
import { AudioVersionStack } from './AudioVersionStack'
import { MergeSongPicker } from './MergeSongPicker'
import { AddVersionButton } from './AddVersionButton'
import { FavouriteButton } from './FavouriteButton'
import { SongTagsEditor } from './SongTagsEditor'
import { SongComments } from './SongComments'
import { SongSharePanel } from './SongSharePanel'
import { VersionCompare } from './VersionCompare'

export function SongDetailDrawer({ readOnly = false }: { readOnly?: boolean }) {
  const { selectedSongId, drawerOpen, closeDrawer } = useUiStore()
  const [mergeOpen, setMergeOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
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
      if (document.querySelector('.song-share-qr-overlay')) return
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
    scheduleFlush()
  }

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const result = await duplicateSong(song.id)
      scheduleFlush()
      if (result.clipsSkipped > 0) {
        alert(
          `Copied "${result.song.title}" with ${result.clipsCopied} clip${
            result.clipsCopied === 1 ? '' : 's'
          }. ${result.clipsSkipped} cloud-only clip${
            result.clipsSkipped === 1 ? ' was' : 's were'
          } skipped — download them first from Settings.`,
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
    <div className="song-drawer-overlay" onClick={closeDrawer}>
      <div className="song-drawer" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button type="button" className="song-drawer-handle" onClick={closeDrawer} aria-label="Close">
          <span className="song-drawer-handle-pill" />
          <span className="song-drawer-handle-label">✕ Close</span>
        </button>
        <div className="scp-header">
          {readOnly ? (
            <h2 className="scp-title-input">{song.title}</h2>
          ) : (
            <input
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
                  {mergeOpen ? 'Close merge' : 'Merge memos'}
                </button>
              </div>
            </div>
          )}

          <AudioVersionStack songId={song.id} readOnly={readOnly} />

          <VersionCompare songId={song.id} />

          {!readOnly && mergeOpen && (
            <MergeSongPicker targetSongId={song.id} onClose={() => setMergeOpen(false)} />
          )}

          {readOnly && song.notes ? <p className="song-detail-notes">{song.notes}</p> : null}

          {!readOnly && (
            <>
              <SongSharePanel songId={song.id} />
              <SongTagsEditor songId={song.id} initialTags={song.tags ?? []} />
              <NotesEditor songId={song.id} initialNotes={song.notes} />
              <ExternalLinks songId={song.id} />
            </>
          )}

          <SongComments songId={song.id} />

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
