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
} from '@/db/repositories/collectionShareRepo'
import { revokeSongShare, shareUrlFromToken } from '@/db/repositories/shareRepo'
import {
  listSentSongLinks,
  listShareListeners,
  type ShareLinkKind,
  type ShareListener,
} from '@/db/repositories/shareListenersRepo'
import '@/styles/listeners.css'

function plural(n: number, one: string) {
  return `${n} ${n === 1 ? one : `${one}s`}`
}

interface SentLink {
  kind: ShareLinkKind
  id: string
  token: string
  title: string
  sub: string
  created_at: string
  expires_at: string | null
  password_required: boolean
  view_count: number
  listen_count: number
  comment_count: number
  last_viewed_at: string | null
}

const FIRST_SHOWN = 10

async function loadLinks(): Promise<SentLink[]> {
  const [collections, songs] = await Promise.all([
    listCollectionLinks().catch(() => []),
    listSentSongLinks().catch(() => []),
  ])
  const songTitles = new Map<string, string>()
  const found = await db.songs.bulkGet([...new Set(songs.map((s) => s.song_id))])
  for (const song of found) if (song) songTitles.set(song.id, song.title)

  const out: SentLink[] = [
    ...collections.map((link) => ({
      kind: 'collection' as const,
      id: link.id,
      token: link.token,
      title: link.title || 'Untitled',
      sub: `${plural(link.track_count, 'track')}${link.artist ? ` · ${link.artist}` : ''}`,
      created_at: link.created_at,
      expires_at: link.expires_at,
      password_required: link.password_required,
      view_count: link.view_count,
      listen_count: link.listen_count,
      comment_count: link.comment_count,
      last_viewed_at: link.last_viewed_at,
    })),
    ...songs.map((link) => ({
      kind: 'song' as const,
      id: link.id,
      token: link.token,
      title: songTitles.get(link.song_id) ?? 'A song',
      sub: link.label ? `One song · ${link.label}` : 'One song',
      created_at: link.created_at,
      expires_at: link.expires_at,
      password_required: link.password_required,
      view_count: link.view_count,
      listen_count: link.listen_count,
      comment_count: 0,
      last_viewed_at: link.last_viewed_at,
    })),
  ]
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function listenerLine(listener: ShareListener) {
  // 23 Sept, Owen: a "place" read off the time zone said London for
  // everyone in the UK, which is not information. Dropped; the name if
  // they gave one, otherwise just "Someone".
  return [listener.name || 'Someone', formatRelativeTime(listener.lastAt), listener.played ? 'played' : 'opened']
    .filter(Boolean)
    .join(' · ')
}

/**
 * The links you have sent, and what happened to them.
 *
 * The question after sending mixes to a label is only ever "did they listen",
 * so the row answers it before anything else: opened, played, notes. Open a
 * row for who listened (a name if they gave one, a rough place from their
 * time zone) and the notes, with the track and the second they are about.
 */
export function SentCollections({ refreshKey }: { refreshKey: number }) {
  const [links, setLinks] = useState<SentLink[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, (CollectionComment & { trackTitle: string })[]>>({})
  const [listeners, setListeners] = useState<Record<string, ShareListener[]>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    loadLinks()
      .then((rows) => live && setLinks(rows))
      .catch(() => live && setLinks([]))
    return () => {
      live = false
    }
  }, [refreshKey, tick])

  const toggle = async (link: SentLink) => {
    if (open === link.id) {
      setOpen(null)
      return
    }
    setOpen(link.id)

    if (!listeners[link.id]) {
      listShareListeners(link.kind, link.id)
        .then((rows) => setListeners((prev) => ({ ...prev, [link.id]: rows })))
        .catch(() => setListeners((prev) => ({ ...prev, [link.id]: [] })))
    }

    if (link.kind !== 'collection' || notes[link.id]) return
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

  const shown = showAll ? links : links.slice(0, FIRST_SHOWN)

  return (
    <section className="sent-links">
      <div className="mixes-section-head">
        <h3 className="mixes-section-title">Links you have sent</h3>
        <span className="mixes-section-note">Opens, plays and notes, as they happen. Open one to see who listened.</span>
      </div>
      <ul className="sent-list">
        {shown.map((link) => {
          const heard = link.listen_count > 0
          const url = link.kind === 'song' ? shareUrlFromToken(link.token) : collectionUrl(link.token)
          const who = listeners[link.id]
          return (
            <li key={link.id} className={`sent-row${open === link.id ? ' is-open' : ''}`}>
              <div className="sent-main">
                <button type="button" className="sent-title" onClick={() => void toggle(link)} aria-expanded={open === link.id}>
                  <span className="sent-name">{link.title}</span>
                  <span className="sent-sub">
                    {link.sub} · sent {formatRelativeTime(link.created_at)}
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
                      void navigator.clipboard.writeText(url).then(() => {
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
                      if (!confirm('Revoke this link? Everyone who has it loses access straight away.')) return
                      const revoke = link.kind === 'song' ? revokeSongShare : revokeCollectionLink
                      void revoke(link.token).then(() => setTick((n) => n + 1))
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>

              {open === link.id && (
                <div className="sent-notes">
                  <p className="listeners-head">Who listened</p>
                  {!who ? (
                    <p className="sent-notes-meta">Loading…</p>
                  ) : who.length === 0 ? (
                    <p className="sent-notes-meta">
                      {link.view_count > 0 ? 'Opened before this was tracked.' : 'Nobody yet.'}
                    </p>
                  ) : (
                    <ul className="listeners-list">
                      {who.map((listener) => (
                        <li key={listener.id} className={listener.played ? 'is-played' : undefined}>
                          {listenerLine(listener)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {link.kind === 'collection' && (
                    <>
                      <p className="listeners-head">Notes</p>
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
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {links.length > FIRST_SHOWN && (
        <button type="button" className="listeners-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${links.length}`}
        </button>
      )}
    </section>
  )
}
