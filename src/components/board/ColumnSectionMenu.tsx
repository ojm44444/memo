import { useEffect, useState } from 'react'
import { deleteColumn, renameColumn } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { INBOX_SLUG, type Column } from '@/types/column'

interface ColumnSectionMenuProps {
  column: Column
}

export function ColumnSectionMenu({ column }: ColumnSectionMenuProps) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(column.title)
  const [error, setError] = useState('')

  // Reset local title state when the column prop changes externally (e.g. sync pull)
  // so reopening the rename field always shows the current saved title.
  useEffect(() => {
    if (!renaming) setTitle(column.title)
  }, [column.title, renaming])

  if (column.slug === INBOX_SLUG) return null

  const submitRename = async () => {
    setError('')
    try {
      await renameColumn(column.id, title)
      setRenaming(false)
      setOpen(false)
      scheduleFlush()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename section')
    }
  }

  const removeSection = async () => {
    if (!confirm(`Delete "${column.title}"? Songs will move to Inbox.`)) return
    try {
      await deleteColumn(column.id)
      setOpen(false)
      scheduleFlush()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete section')
    }
  }

  return (
    <div className="column-section-menu">
      <button
        type="button"
        className="column-section-menu-btn"
        aria-label={`${column.title} options`}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>

      {open && (
        <div className="column-section-menu-panel">
          {renaming ? (
            <>
              <input
                className="column-section-menu-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
              />
              <button type="button" onClick={() => void submitRename()}>
                Save
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setRenaming(true)}>
                Rename
              </button>
              <button type="button" className="is-danger" onClick={() => void removeSection()}>
                Delete
              </button>
            </>
          )}
          {error && <p className="column-section-menu-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
