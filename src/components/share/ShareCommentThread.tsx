import { useState } from 'react'
import { formatDuration } from '@/lib/audio-utils'
import type { ShareListenComment } from '@/db/repositories/shareRepo'

interface ShareCommentThreadProps {
  comments: ShareListenComment[]
  currentMs: number
  authorName: string
  onAuthorNameChange: (name: string) => void
  draftBody: string
  onDraftBodyChange: (body: string) => void
  pinMs: number | null
  onPinAtCurrent: () => void
  onClearPin: () => void
  onSubmit: () => Promise<void>
  submitting: boolean
  onSeek: (ms: number) => void
}

export function ShareCommentThread({
  comments,
  currentMs,
  authorName,
  onAuthorNameChange,
  draftBody,
  onDraftBodyChange,
  pinMs,
  onPinAtCurrent,
  onClearPin,
  onSubmit,
  submitting,
  onSeek,
}: ShareCommentThreadProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <section className="share-comments">
      <button
        type="button"
        className="share-comments-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        Feedback {comments.length > 0 ? `(${comments.length})` : ''}
      </button>

      {expanded && (
        <>
          <p className="share-muted share-comments-hint">
            Pin a note to a moment — click &ldquo;Comment here&rdquo; while listening, or use the current
            playhead.
          </p>

          <ul className="share-comment-list">
            {comments.map((comment) => (
              <li key={comment.id} className="share-comment-item">
                <button
                  type="button"
                  className="share-comment-time"
                  onClick={() => onSeek(comment.timestamp_ms)}
                  title="Jump to this moment"
                >
                  {formatDuration(comment.timestamp_ms)}
                </button>
                <div className="share-comment-body">
                  <span className="share-comment-author">{comment.author_name}</span>
                  <p>{comment.body}</p>
                </div>
              </li>
            ))}
            {comments.length === 0 && <li className="share-muted">No feedback yet — be the first.</li>}
          </ul>

          <div className="share-comment-form">
            <div className="share-comment-form-row">
              <input
                type="text"
                className="share-comment-name"
                placeholder="Your name"
                value={authorName}
                onChange={(e) => onAuthorNameChange(e.target.value)}
                maxLength={40}
              />
              <button type="button" className="share-comment-pin" onClick={onPinAtCurrent}>
                Comment at {formatDuration(pinMs ?? currentMs)}
              </button>
              {pinMs !== null && (
                <button type="button" className="share-comment-clear-pin" onClick={onClearPin}>
                  Clear pin
                </button>
              )}
            </div>
            <textarea
              className="share-comment-input"
              placeholder="What do you think at this moment?"
              value={draftBody}
              onChange={(e) => onDraftBodyChange(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <button
              type="button"
              className="share-primary"
              disabled={submitting || !draftBody.trim()}
              onClick={() => void onSubmit()}
            >
              {submitting ? 'Posting…' : 'Post feedback'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
