import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addSongComment,
  deleteSongComment,
  getCommentsForSong,
} from '@/db/repositories/commentRepo'
import { getBoardUserId } from '@/lib/auth/session'
import { scheduleFlush } from '@/sync/syncEngine'

interface SongCommentsProps {
  songId: string
  readOnly?: boolean
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function SongComments({ songId, readOnly = false }: SongCommentsProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const comments = useLiveQuery(() => getCommentsForSong(songId), [songId])
  const userId = useLiveQuery(async () => getBoardUserId(), [])

  const submit = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await addSongComment(songId, draft)
      setDraft('')
      scheduleFlush()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="song-comments">
      <span className="song-detail-label">Comments</span>

      {(comments?.length ?? 0) > 0 && (
        <ul className="song-comments-list">
          {comments?.map((comment) => (
            <li key={comment.id} className="song-comment">
              <div className="song-comment-header">
                <span className="song-comment-author">{comment.authorLabel}</span>
                <span className="song-comment-time">{formatWhen(comment.createdAt)}</span>
                {!readOnly && comment.userId === userId && (
                  <button
                    type="button"
                    className="song-comment-delete"
                    onClick={() => void deleteSongComment(comment.id).then(() => scheduleFlush())}
                    aria-label="Delete comment"
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="song-comment-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="song-comments-compose">
          <textarea
            className="song-comments-input"
            rows={2}
            placeholder="Leave a note for your co-writer…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
            }}
          />
          <button
            type="button"
            className="song-comments-send"
            disabled={busy || !draft.trim()}
            onClick={() => void submit()}
          >
            {busy ? 'Sending…' : 'Add comment'}
          </button>
        </div>
      )}
    </div>
  )
}
