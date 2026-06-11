import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { duplicateSong } from '@/db/repositories/audioRepo'
import { deleteSong, getSong, updateSong } from '@/db/repositories/boardRepo'
import { SongStageSelect } from './SongStageSelect'
import { SongProjectSelect } from './SongProjectSelect'
import { scheduleFlush } from '@/sync/syncEngine'
import { useUiStore } from '@/stores/uiStore'
import { usePlayerStore } from '@/stores/playerStore'
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
    if (!drawerOpen) setMergeOpen(false)
  }, [drawerOpen])

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
      <div className="song-drawer" onClick={(e) => e.stopPropagation()}>
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
            projectId={song.projectId}
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

        <button type="button" onClick={closeDrawer} className="song-drawer-close" aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  )
}
