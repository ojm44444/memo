import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addSongComment,
  deleteSongComment,
  getCommentsForSong,
} from '@/db/repositories/commentRepo'
import { db } from '@/db/database'
import { getBoardUserId } from '@/lib/auth/session'
import { usePlayerStore } from '@/stores/playerStore'
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

function formatMs(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function SongComments({ songId, readOnly = false }: SongCommentsProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingStamp, setPendingStamp] = useState(false)
  const comments = useLiveQuery(() => getCommentsForSong(songId), [songId])
  const userId = useLiveQuery(async () => getBoardUserId(), [])

  const { currentSongId, currentVersionId, progress } = usePlayerStore()
  const isThisSongPlaying = currentSongId === songId

  const submit = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      let ts: number | undefined
      if (pendingStamp && isThisSongPlaying && currentVersionId) {
        const version = await db.audioVersions.get(currentVersionId)
        if (version && version.durationMs > 0) {
          ts = Math.round(progress * version.durationMs)
        }
      }
      await addSongComment(songId, draft, ts)
      setDraft('')
      setPendingStamp(false)
      scheduleFlush()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="song-comments">
      <span className="song-detail-label">Notes &amp; comments</span>

      {(comments?.length ?? 0) > 0 && (
        <ul className="song-comments-list">
          {comments?.map((comment) => (
            <li key={comment.id} className="song-comment">
              <div className="song-comment-header">
                {comment.timestampMs != null && (
                  <span className="song-comment-timestamp">{formatMs(comment.timestampMs)}</span>
                )}
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
          {isThisSongPlaying && (
            <button
              type="button"
              className={`song-comments-stamp-btn${pendingStamp ? ' is-active' : ''}`}
              onClick={() => setPendingStamp((v) => !v)}
              title={pendingStamp ? 'Remove timestamp' : 'Stamp comment with current playback time'}
            >
              ⏱ {pendingStamp ? 'Stamped' : 'Stamp time'}
            </button>
          )}
          <textarea
            className="song-comments-input"
            rows={2}
            placeholder="Leave a note…"
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
            {busy ? 'Sending…' : 'Add note'}
          </button>
        </div>
      )}
    </div>
  )
}
