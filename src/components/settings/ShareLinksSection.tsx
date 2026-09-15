import { useEffect, useState } from 'react'
import {
  getShareLinkSummary,
  revokeAllShareLinks,
  type ShareLinkSummary,
} from '@/db/repositories/shareRepo'

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Every way into your board without an account, and one button that closes
 * them all.
 *
 * Share links are the only unauthenticated route into songdrafts, so this is
 * the control you reach for when a link has gone somewhere it should not, or
 * when you simply want to know nothing is open. Song links could already be
 * revoked one song at a time; playlist links could not be revoked at all, and
 * nothing anywhere said how many links you had out.
 *
 * The counts are read before the button is offered, so it says what it will
 * do. After it runs, a link someone already has stops playing at once: the
 * storage rules refuse a revoked share's audio, not only the listen page.
 */
export function ShareLinksSection() {
  const [summary, setSummary] = useState<ShareLinkSummary | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setSummary(await getShareLinkSummary())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => {
    let live = true
    getShareLinkSummary()
      .then((next) => live && setSummary(next))
      .catch(() => live && setLoadError(true))
    return () => {
      live = false
    }
  }, [])

  const total = summary ? summary.song_links + summary.playlist_links + summary.invites : 0

  const describe = (s: ShareLinkSummary) => {
    const parts = [
      s.song_links ? plural(s.song_links, 'song link') : null,
      s.playlist_links ? plural(s.playlist_links, 'playlist link') : null,
      s.invites ? plural(s.invites, 'bandmate invite') : null,
    ].filter(Boolean)
    return parts.join(', ')
  }

  const revokeAll = async () => {
    setBusy(true)
    setError(null)
    try {
      const done = await revokeAllShareLinks()
      const count = done.song_links + done.playlist_links + done.invites
      setResult(
        count === 0
          ? 'Nothing was open.'
          : `Revoked ${describe(done)}. Anyone holding one of them can no longer open it.`,
      )
      setConfirming(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the links. Nothing changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Share links</h3>
      <p className="settings-section-copy">
        {loadError
          ? 'Could not check your links just now.'
          : summary === null
            ? 'Checking…'
            : total === 0
              ? 'No links are open. Nobody can reach your songs without signing in.'
              : `Open right now: ${describe(summary)}. Anyone holding one can use it until it expires or you revoke it.`}
      </p>

      {result && <p className="settings-import-result">{result}</p>}

      {total > 0 && !confirming && (
        <button type="button" className="settings-export" onClick={() => setConfirming(true)}>
          Revoke all links
        </button>
      )}

      {confirming && summary && (
        <div className="settings-everywhere">
          <p className="settings-field-note" style={{ marginTop: 0 }}>
            This stops every link at once: {describe(summary)}. Expired song links are revoked
            too, so they cannot be renewed. Comments left on them stay on your songs. You can
            make new links afterwards.
          </p>
          <div className="reminder-row" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className="settings-delete-confirm"
              disabled={busy}
              onClick={() => void revokeAll()}
            >
              {busy ? 'Revoking…' : `Revoke ${plural(total, 'link')}`}
            </button>
            <button
              type="button"
              className="settings-avatar-clear"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="settings-avatar-error">{error}</p>}
    </section>
  )
}
