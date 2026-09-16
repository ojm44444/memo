import { useEffect, useMemo, useRef, useState } from 'react'
import { RecordArt } from '@/components/share/RecordParts'
import { uploadCollectionCover } from '@/db/repositories/collectionShareRepo'
import {
  createListenProject,
  deleteListenProject,
  listenCoverUrl,
  updateListenProject,
} from '@/db/repositories/listenProjectRepo'
import { getMyDisplayName } from '@/lib/displayName'
import { scheduleFlush } from '@/sync/syncEngine'
import type { ListenProject } from '@/types/listen-project'

/**
 * Make or edit a Listen project: a cover, a title, who it is by.
 * Three fields, because that is what a release is before it has songs in it.
 */
export function ProjectSheet({
  project,
  onClose,
  onSaved,
  onDeleted,
}: {
  project?: ListenProject | null
  onClose: () => void
  onSaved: (project: ListenProject) => void
  onDeleted?: () => void
}) {
  const [title, setTitle] = useState(project?.title ?? '')
  const [artist, setArtist] = useState(project?.artist ?? '')
  const [cover, setCover] = useState<File | null>(null)
  const [existingCover, setExistingCover] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    let live = true
    if (project?.coverPath) void listenCoverUrl(project.coverPath).then((url) => live && setExistingCover(url))
    if (!project) void getMyDisplayName().then((name) => live && setArtist((prev) => prev || (name === 'You' ? '' : name)))
    return () => {
      live = false
    }
  }, [project])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      let coverPath = project?.coverPath ?? null
      if (cover) {
        try {
          coverPath = await uploadCollectionCover(cover)
        } catch {
          setError('The cover needs a connection to upload. Saved without it; add it again when online.')
        }
      }
      const saved = project
        ? await updateListenProject(project.id, { title: title.trim() || 'Untitled', artist: artist.trim() || null, coverPath })
        : await createListenProject({ title, artist, coverPath })
      scheduleFlush()
      if (saved) onSaved(saved)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="send-sheet-backdrop" onClick={onClose}>
      <div className="send-sheet is-narrow" role="dialog" aria-modal="true" aria-label={project ? 'Edit project' : 'New project'} onClick={(e) => e.stopPropagation()}>
        <div className="send-sheet-head">
          <h2 className="send-sheet-title">{project ? 'Edit project' : 'New project'}</h2>
          <button type="button" className="send-sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="send-sheet-top">
            <button type="button" className="send-cover" onClick={() => input.current?.click()} aria-label="Cover">
              <RecordArt seed={project?.id ?? (title || 'new')} label="" src={preview ?? existingCover} />
              <span className="send-cover-label">{cover || existingCover ? 'Change' : 'Add cover'}</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                e.target.value = ''
                if (file) setCover(file)
              }}
            />
            <div className="send-sheet-fields">
              <label className="send-field">
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The EP" maxLength={120} autoFocus />
              </label>
              <label className="send-field">
                <span>Artist</span>
                <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Your artist name" maxLength={120} />
              </label>
            </div>
          </div>

          {error && <p className="send-sheet-error">{error}</p>}

          <div className="send-sheet-actions">
            {project && onDeleted && (
              confirmDelete ? (
                <button
                  type="button"
                  className="send-sheet-danger"
                  onClick={() => {
                    void deleteListenProject(project.id).then(() => {
                      scheduleFlush()
                      onDeleted()
                    })
                  }}
                >
                  Delete it. Songs stay.
                </button>
              ) : (
                <button type="button" className="send-sheet-link is-danger" onClick={() => setConfirmDelete(true)}>
                  Delete project
                </button>
              )
            )}
            <span className="send-sheet-spacer" />
            <button type="button" className="send-sheet-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="send-sheet-primary" disabled={busy}>
              {busy ? 'Saving…' : project ? 'Save' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
