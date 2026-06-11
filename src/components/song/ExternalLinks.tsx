import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createId } from '@/lib/ids'
import { db } from '@/db/database'
import { enqueueSync } from '@/db/repositories/outboxRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface ExternalLinksProps {
  songId: string
}

export function ExternalLinks({ songId }: ExternalLinksProps) {
  const links = useLiveQuery(() => db.songLinks.where('songId').equals(songId).toArray(), [songId])
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  const addLink = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    const link = {
      id: createId(),
      songId,
      url: trimmedUrl,
      label: label.trim(),
      createdAt: new Date().toISOString(),
    }
    await db.songLinks.add(link)
    await enqueueSync('create', 'song_link', link.id, link)
    scheduleFlush()
    setUrl('')
    setLabel('')
    setAdding(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="song-detail-label">Inspiration</span>
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="song-detail-link">
            + Add link
          </button>
        ) : null}
      </div>

      {adding && (
        <div className="external-links-form">
          <input
            className="external-links-input"
            placeholder="https://open.spotify.com/…"
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addLink()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <input
            className="external-links-input"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addLink()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <div className="external-links-actions">
            <button type="button" className="song-detail-link" onClick={() => void addLink()}>
              Save
            </button>
            <button type="button" className="song-detail-link" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {links?.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="scp-inspiration"
          >
            <span className="spotify-dot">♫</span>
            <span className="scp-spot-text">
              Ref: <strong>{link.label || link.url}</strong>
            </span>
          </a>
        ))}
        {!links?.length && !adding && (
          <p className="text-xs text-muted">Spotify refs, YouTube links, whatever inspires this.</p>
        )}
      </div>
    </div>
  )
}
