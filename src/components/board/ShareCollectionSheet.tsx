import { useEffect, useMemo, useRef, useState } from 'react'
import type { AudioVersion } from '@/types/audio-version'
import type { Song } from '@/types/song'
import { formatDuration } from '@/lib/audio-utils'
import { getMyDisplayName } from '@/lib/displayName'
import { SHARE_LIFETIMES, type ShareLifetimeDays } from '@/db/repositories/shareRepo'
import {
  collectionUrl,
  createCollectionShare,
  listCollectionLinks,
  uploadCollectionCover,
  type CollectionItem,
  type CollectionLinkRow,
} from '@/db/repositories/collectionShareRepo'
import { listenCoverUrl } from '@/db/repositories/listenProjectRepo'
import { RecordArt } from '@/components/share/RecordParts'
import { kindName } from '@/lib/kindName'

type Stack = { song: Song; latest: AudioVersion; versions: AudioVersion[] }

type Pick = { songId: string; versionId: string; on: boolean }

const LIFETIMES_FOR_LABELS = SHARE_LIFETIMES.filter((l) => l.days !== 1)

/**
 * Send a set of mixes as one link.
 *
 * Defaults do the work: every stack is in, in the order the room shows them,
 * each playing the top of its stack. Give it a name and press the button.
 * Everything else (a different version, earlier versions, a password,
 * downloads, how long it lasts) is there but already answered.
 */
export function ShareCollectionSheet({
  stacks,
  onClose,
  onCreated,
  defaults,
}: {
  stacks: Stack[]
  onClose: () => void
  onCreated: () => void
  /** A project's own title, artist and cover, so sharing it is one press. */
  defaults?: { title: string; artist: string | null; coverPath: string | null }
}) {
  const [picks, setPicks] = useState<Pick[]>(() =>
    stacks.map((s) => ({ songId: s.song.id, versionId: s.latest.id, on: true })),
  )
  const [title, setTitle] = useState(defaults?.title ?? '')
  const [artist, setArtist] = useState(defaults?.artist ?? '')
  const [projectCover, setProjectCover] = useState<string | null>(null)
  const [withEarlier, setWithEarlier] = useState(false)
  const [allowDownload, setAllowDownload] = useState(false)
  const [password, setPassword] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<ShareLifetimeDays>(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [cover, setCover] = useState<File | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])
  /* 23 Sept, Owen: pressing Share always minted a new link, so the same
     playlist piled up several live links, one per press. If a live link
     already has this exact title, offer it first instead. `undefined`
     while checking, `null` once checked and there is none. */
  const [existing, setExisting] = useState<CollectionLinkRow | null | undefined>(
    defaults?.title ? undefined : null,
  )
  const [useExisting, setUseExisting] = useState(true)

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
  }, [coverPreview])

  useEffect(() => {
    let live = true
    if (defaults?.coverPath) void listenCoverUrl(defaults.coverPath).then((u) => live && setProjectCover(u))
    return () => {
      live = false
    }
  }, [defaults?.coverPath])

  useEffect(() => {
    const wanted = defaults?.title?.trim().toLowerCase()
    if (!wanted) return
    let live = true
    void listCollectionLinks()
      .then((links) => {
        if (live) setExisting(links.find((l) => l.title?.trim().toLowerCase() === wanted) ?? null)
      })
      .catch(() => live && setExisting(null))
    return () => {
      live = false
    }
  }, [defaults?.title])

  useEffect(() => {
    void getMyDisplayName().then((name) => setArtist((prev) => prev || (name === 'You' ? '' : name)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stackBySong = useMemo(() => new Map(stacks.map((s) => [s.song.id, s])), [stacks])

  const items: CollectionItem[] = useMemo(() => {
    const out: CollectionItem[] = []
    for (const pick of picks) {
      if (!pick.on) continue
      out.push({ songId: pick.songId, versionId: pick.versionId })
      if (withEarlier) {
        const stack = stackBySong.get(pick.songId)
        for (const v of stack?.versions ?? []) {
          if (v.id !== pick.versionId) out.push({ songId: pick.songId, versionId: v.id })
        }
      }
    }
    return out
  }, [picks, withEarlier, stackBySong])

  const chosenCount = picks.filter((p) => p.on).length
  const notUploaded = stacks.filter((s) => !s.versions.some((v) => v.storagePath)).length

  const move = (index: number, by: -1 | 1) => {
    setPicks((prev) => {
      const nextIndex = index + by
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      ;[copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]]
      return copy
    })
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const coverPath = cover ? await uploadCollectionCover(cover) : (defaults?.coverPath ?? null)
      const link = await createCollectionShare(items, {
        title,
        artist,
        allowDownload,
        expiresInDays,
        password,
        coverPath,
      })
      setUrl(link)
      onCreated()
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
      } catch {
        /* the link is on screen to copy by hand */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the link. Nothing was shared.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="send-sheet-backdrop" onClick={onClose}>
      <div
        className="send-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="send-sheet-head">
          <h2 className="send-sheet-title">{url ? 'Your link is ready' : 'Share settings'}</h2>
          <button type="button" className="send-sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {url ? (
          <div className="send-sheet-done">
            <p className="send-sheet-note">
              {copied ? 'Copied. ' : ''}Anyone with the link can listen, no account needed.
              {password.trim() ? ' They will need the password too.' : ''}
            </p>
            <div className="send-sheet-url">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }
              >
                Copy
              </button>
            </div>
            <div className="send-sheet-actions">
              <a className="send-sheet-secondary" href={url} target="_blank" rel="noopener noreferrer">
                Open it
              </a>
              <button type="button" className="send-sheet-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : existing && useExisting ? (
          <div className="send-sheet-done">
            <p className="send-sheet-note">
              This playlist already has a live link: {existing.view_count} {existing.view_count === 1 ? 'open' : 'opens'},{' '}
              {existing.listen_count} {existing.listen_count === 1 ? 'play' : 'plays'}. Sharing again reuses it rather
              than making another.
            </p>
            <div className="send-sheet-url">
              <input
                readOnly
                value={collectionUrl(existing.token)}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link"
              />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(collectionUrl(existing.token))
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="send-sheet-actions">
              <button type="button" className="send-sheet-secondary" onClick={() => setUseExisting(false)}>
                Make a new link instead
              </button>
              <button type="button" className="send-sheet-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="send-sheet-top">
              <button
                type="button"
                className="send-cover"
                onClick={() => coverInput.current?.click()}
                aria-label={cover ? 'Change the cover' : 'Add a cover'}
              >
                <RecordArt seed={title || 'cover'} label="" src={coverPreview ?? projectCover} />
                <span className="send-cover-label">{cover || projectCover ? 'Change' : 'Add cover'}</span>
              </button>
              <input
                ref={coverInput}
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
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="EP mixes"
                  maxLength={120}
                  autoFocus
                />
              </label>
              <label className="send-field">
                <span>Artist</span>
                <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Your artist name" maxLength={120} />
              </label>
            </div>
            </div>

            <p className="send-sheet-label">
              Tracks · {chosenCount} of {stacks.length}
            </p>
            <ul className="send-tracks">
              {picks.map((pick, index) => {
                const stack = stackBySong.get(pick.songId)
                if (!stack) return null
                // Still-uploading takes can go in the link now (17 Sept); they fill in when they land.
                const uploading = !stack.versions.find((v) => v.id === pick.versionId)?.storagePath
                return (
                  <li key={pick.songId} className={`send-track${pick.on ? '' : ' is-off'}`}>
                    <input
                      type="checkbox"
                      checked={pick.on}
                      onChange={(e) =>
                        setPicks((prev) => prev.map((p, i) => (i === index ? { ...p, on: e.target.checked } : p)))
                      }
                      aria-label={`Include ${stack.song.title}`}
                    />
                    <div className="send-track-body">
                      <span className="send-track-title">{stack.song.title}</span>
                      {uploading && (
                        <span className="send-track-warn">Still uploading. It appears in the link as soon as it finishes.</span>
                      )}
                      {(
                        <select
                          value={pick.versionId}
                          onChange={(e) =>
                            setPicks((prev) => prev.map((p, i) => (i === index ? { ...p, versionId: e.target.value } : p)))
                          }
                          aria-label={`Version of ${stack.song.title}`}
                        >
                          {stack.versions.map((v, vi) => (
                            <option key={v.id} value={v.id}>
                              V{stack.versions.length - vi}
                              {vi === 0 ? ' (top)' : ''} · {kindName(v.kind)}
                              {v.label ? ` · ${v.label}` : ''} · {formatDuration(v.durationMs)}
                              {!v.storagePath ? ' · uploading' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="send-track-move">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === picks.length - 1}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {notUploaded > 0 && (
              <p className="send-sheet-note">
                {notUploaded} {notUploaded === 1 ? 'track is' : 'tracks are'} still uploading. Keep songdrafts open;
                {notUploaded === 1 ? ' it appears' : ' they appear'} in the link the moment the upload finishes.
              </p>
            )}

            <div className="send-options">
              <label className="send-check">
                <input type="checkbox" checked={withEarlier} onChange={(e) => setWithEarlier(e.target.checked)} />
                Include earlier versions under each track
              </label>
              <label className="send-check">
                <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
                Let them download
              </label>
              <div className="send-options-row">
                <label className="send-field is-inline">
                  <span>Works for</span>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value) as ShareLifetimeDays)}
                  >
                    {LIFETIMES_FOR_LABELS.map((l) => (
                      <option key={l.days} value={l.days}>
                        {l.days === 0 ? 'Until I revoke it' : l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="send-field is-inline">
                  <span>Password</span>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>

            {error && <p className="send-sheet-error">{error}</p>}

            <div className="send-sheet-actions">
              <button type="button" className="send-sheet-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="send-sheet-primary"
                disabled={busy || items.length === 0}
                onClick={() => void create()}
              >
                {busy ? 'Making the link…' : 'Create link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
