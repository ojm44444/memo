import { useState } from 'react'
import { createColumn } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'

export function AddSectionButton() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      await createColumn(title)
      setTitle('')
      setOpen(false)
      scheduleFlush()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add section')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="board-add-section" onClick={() => setOpen(true)}>
        + Section
      </button>
    )
  }

  return (
    <div className="board-add-section-form">
      <input
        type="text"
        className="board-add-section-input"
        placeholder="Section name"
        value={title}
        autoFocus
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <button type="button" className="board-add-section-save" disabled={busy} onClick={() => void submit()}>
        Add
      </button>
      <button type="button" className="board-add-section-cancel" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className="board-add-section-error">{error}</span>}
    </div>
  )
}
