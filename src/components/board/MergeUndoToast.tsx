import { useEffect, useState } from 'react'
import { undoMerge } from '@/db/repositories/boardRepo'
import { useUiStore } from '@/stores/uiStore'
import { scheduleFlush } from '@/sync/syncEngine'

/** Long enough to notice and reach for, short enough not to linger. */
const UNDO_WINDOW_MS = 10_000

/**
 * "Merged into Sad piano riff. Undo."
 *
 * Every merge, from the board, the drawer or a bulk selection, lands here.
 * It names both songs, because the failure this exists for was a merge nobody
 * saw happen: a card that simply read "No take on this one yet" afterwards,
 * with the take quietly stacked on a different song two columns away.
 */
export function MergeUndoToast() {
  const record = useUiStore((s) => s.mergeUndo)
  const showMergeUndo = useUiStore((s) => s.showMergeUndo)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!record) return
    const timer = window.setTimeout(() => showMergeUndo(null), UNDO_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [record, showMergeUndo])

  if (!record) return null

  const sources = record.sources.map((s) => `“${s.sourceTitle}”`)
  const what = sources.length === 1 ? sources[0] : `${sources.length} songs`
  const takes = record.sources.reduce((n, s) => n + s.versions.length, 0)

  return (
    <div className="merge-undo-toast" role="status" aria-live="polite">
      <p className="merge-undo-toast-message">
        Merged {what} into <strong>“{record.targetTitle}”</strong>
        {takes > 0 ? `. ${takes} take${takes === 1 ? '' : 's'} moved.` : '.'}
      </p>
      <button
        type="button"
        className="merge-undo-toast-undo"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void undoMerge(record)
            .then(() => {
              scheduleFlush()
              showMergeUndo(null)
            })
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
      <button
        type="button"
        className="merge-undo-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => showMergeUndo(null)}
      >
        ✕
      </button>
    </div>
  )
}
