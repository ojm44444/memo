import { useEffect, useState } from 'react'
import { formatDuration } from '@/lib/audio-utils'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { db } from '@/db/database'
import {
  collectionUrl,
  listCollectionComments,
  listCollectionLinks,
  revokeCollectionLink,
  type CollectionComment,
  type CollectionLinkRow,
} from '@/db/repositories/collectionShareRepo'

function plural(n: number, one: string) {
  return `${n} ${n === 1 ? one : `${one}s`}`
}

/**
 * The links you have sent, and what happened to them.
 *
 * The question after sending mixes to a label is only ever "did they listen",
 * so the row answers it before anything else: opened, played, notes. Notes
 * open under the row with the track and the second they are about.
 */
export function SentCollections({ refreshKey }: { refreshKey: number }) {
  const [links, setLinks] = useState<CollectionLinkRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, (CollectionComment & { trackTitle: string })[]>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    listCollectionLinks()
      .then((rows) => live && setLinks(rows))
      .catch(() => live && setLinks([]))
    return () => {
      live = false
    }
  }, [refreshKey, tick])

  const toggle = async (link: CollectionLinkRow) => {
    if (open === link.id) {
      setOpen(null)
      return
    }
    setOpen(link.id)
    if (notes[link.id]) return
    try {
      const rows = await listCollectionComments(link.id)
      const withTitles = await Promise.all(
        rows.map(async (row) => {
          const version = await db.audioVersions.get(row.version_id)
          const song = version ? await db.songs.get(version.songId) : undefined
          return { ...row, trackTitle: song?.title ?? 'A track' }
        }),
      )
      setNotes((prev) => ({ ...prev, [link.id]: withTitles }))
    } catch {
      setNotes((prev) => ({ ...prev, [link.id]: [] }))
    }
  }

  if (!links || links.length === 0) return null

  return (
    <section className="sent-links">
      <div className="mixes-section-head">
        <h3 className="mixes-section-title">Links you have sent</h3>
        <span className="mixes-section-note">Opens, plays and notes, as they happen.</span>
      </div>
      <ul className="sent-list">
        {links.map((link) => {
          const heard = link.listen_count > 0
          return (
            <li key={link.id} className={`sent-row${open === link.id ? ' is-open' : ''}`}>
              <div className="sent-main">
                <button type="button" className="sent-title" onClick={() => void toggle(link)} aria-expanded={open === link.id}>
                  <span className="sent-name">{link.title || 'Untitled'}</span>
                  <span className="sent-sub">
                    {plural(link.track_count, 'track')}
                    {link.artist ? ` · ${link.artist}` : ''} · sent {formatRelativeTime(link.created_at)}
                    {link.password_required ? ' · password' : ''}
                    {link.expires_at
                      ? ` · until ${new Date(link.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                      : ''}
                  </span>
                </button>
                <span className={`sent-stats${heard ? ' is-heard' : ''}`}>
                  {link.view_count === 0
                    ? 'Not opened yet'
                    : `${plural(link.view_count, 'open')} · ${plural(link.listen_count, 'play')}${
                        link.comment_count ? ` · ${plural(link.comment_count, 'note')}` : ''
                      }`}
                </span>
                <div className="sent-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(collectionUrl(link.token)).then(() => {
                        setCopied(link.id)
                        setTimeout(() => setCopied(null), 2000)
                      })
                    }
                  >
                    {copied === link.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Stop "${link.title || 'this link'}" working? Anyone holding it loses access now.`)) return
                      void revokeCollectionLink(link.token).then(() => setTick((n) => n + 1))
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>

              {open === link.id && (
                <div className="sent-notes">
                  {link.last_viewed_at && (
                    <p className="sent-notes-meta">Last opened {formatRelativeTime(link.last_viewed_at)}</p>
                  )}
                  {!notes[link.id] ? (
                    <p className="sent-notes-meta">Loading notes…</p>
                  ) : notes[link.id].length === 0 ? (
                    <p className="sent-notes-meta">No notes yet.</p>
                  ) : (
                    <ul className="sent-notes-list">
                      {notes[link.id].map((note) => (
                        <li key={note.id}>
                          <span className="sent-note-where">
                            {note.trackTitle} · {formatDuration(note.timestamp_ms)}
                          </span>
                          <span className="sent-note-body">
                            <strong>{note.author_name}</strong> {note.body}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
