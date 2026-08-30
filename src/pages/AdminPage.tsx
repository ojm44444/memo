import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import '@/styles/globals.css'
import '@/styles/admin.css'

/**
 * Owner-only product analytics.
 *
 * Gating is done SERVER side: owner_product_summary() raises unless
 * auth.uid() matches the owner, and RLS on product_events only grants SELECT
 * to the owner. Hiding the route would be security by obscurity; this page
 * simply cannot show anyone else's numbers even if they find the URL.
 *
 * It is metadata only, by design. The landing page promises nobody browses
 * your songs, so there is deliberately no way to reach a title, a note or a
 * recording from here. Counts and dates only.
 */

type Summary = Record<string, number>

const ACTIVATION = [
  {
    key: 'accounts_that_imported',
    label: 'Got anything in',
    of: 'accounts',
    note: 'An account with no import never really started.',
  },
  {
    key: 'imported_more_than_once',
    label: 'Imported more than once',
    of: 'accounts_that_imported',
    note: 'One import is curiosity. Two is intent.',
  },
  {
    key: 'returned_another_day',
    label: 'Came back another day',
    of: 'accounts',
    note: 'The whole premise is a place you return to.',
  },
  {
    key: 'moved_a_card',
    label: 'Moved a card right',
    of: 'accounts',
    note: 'This is the product. If this stays at zero, the board is not the answer.',
    critical: true,
  },
  {
    key: 'named_a_song',
    label: 'Named a song',
    of: 'accounts',
    note: 'The cheapest proxy for caring.',
  },
]

function pct(n: number, d: number) {
  if (!d) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

export function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setError('No cloud connection on this build.')
        return
      }
      // Cast: the checked-in Supabase types predate this function. The call is
      // still type-safe at the boundary below, where each row is validated
      // into a plain number.
      const { data, error: err } = await (
        supabase.rpc as unknown as (
          fn: string,
        ) => Promise<{ data: { metric: string; value: number }[] | null; error: { message: string } | null }>
      )('owner_product_summary')
      if (err) {
        // Two different refusals, both correct, both meaningless to a person:
        // "not authorised" is the function's own check for a signed-in
        // non-owner; "permission denied" is Postgres refusing anon, who has no
        // EXECUTE grant. Neither should be shown raw.
        const refused =
          err.message.includes('not authorised') || err.message.includes('permission denied')
        setError(refused ? 'This page is for the owner account.' : err.message)
        return
      }
      const out: Summary = {}
      for (const row of data ?? []) {
        out[row.metric] = Number(row.value)
      }
      setSummary(out)
    })()
  }, [])

  if (error) {
    return (
      <div className="admin">
        <div className="admin-empty">
          <h1>{error}</h1>
          <Link to="/app" className="admin-back">Back to the board</Link>
        </div>
      </div>
    )
  }

  if (!summary) {
    return <div className="admin"><div className="admin-empty"><p>Reading…</p></div></div>
  }

  const accounts = summary.accounts ?? 0
  const costCovered = accounts * 9 >= 25

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <p className="admin-eyebrow">songdrafts · owner</p>
          <h1>Is anyone using it?</h1>
        </div>
        <Link to="/app" className="admin-back">Board</Link>
      </header>

      <section className="admin-block">
        <h2 className="admin-h2">The four numbers</h2>
        <p className="admin-lede">
          Instrumented, not asked. People are unreliable narrators of their own behaviour.
        </p>
        <div className="admin-activation">
          {ACTIVATION.map((row) => {
            const n = summary[row.key] ?? 0
            const d = summary[row.of] ?? 0
            return (
              <div key={row.key} className={`admin-step${row.critical ? ' is-critical' : ''}`}>
                <div className="admin-step-top">
                  <span className="admin-step-label">{row.label}</span>
                  <span className="admin-step-n">
                    {n}<span className="admin-step-of"> / {d}</span>
                  </span>
                </div>
                <div className="admin-bar">
                  <span style={{ width: d ? `${Math.min(100, (n / d) * 100)}%` : '0%' }} />
                </div>
                <p className="admin-step-note">
                  <strong>{pct(n, d)}</strong> {row.note}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="admin-block">
        <h2 className="admin-h2">Where the business is</h2>
        <div className="admin-grid">
          <div className="admin-stat">
            <p className="admin-k">Accounts</p>
            <p className="admin-v">{accounts}</p>
          </div>
          <div className="admin-stat">
            <p className="admin-k">Songs stored</p>
            <p className="admin-v">{summary.songs_total ?? 0}</p>
          </div>
          <div className="admin-stat">
            <p className="admin-k">Cloud storage</p>
            <p className="admin-v">{mb(summary.storage_bytes ?? 0)}</p>
            <p className="admin-s">
              {(((summary.storage_bytes ?? 0) / 1024 / 1024 / 1024) * 100).toFixed(1)}% of the 1 GB free tier
            </p>
          </div>
          <div className="admin-stat">
            <p className="admin-k">Events, 7 days</p>
            <p className="admin-v">{summary.events_7d ?? 0}</p>
          </div>
        </div>

        <div className={`admin-break${costCovered ? ' is-covered' : ''}`}>
          <p className="admin-k">Break even</p>
          <p>
            {accounts} {accounts === 1 ? 'account' : 'accounts'} at $9 is{' '}
            <strong>${accounts * 9}</strong> against <strong>$25</strong> of hosting.{' '}
            {costCovered
              ? 'Costs are covered.'
              : `${Math.max(0, 3 - accounts)} more paying and it pays for itself.`}
          </p>
        </div>
      </section>

      <footer className="admin-foot">
        Metadata only. No titles, notes or audio are recorded or reachable from this page,
        because the landing page promises exactly that.
      </footer>
    </div>
  )
}
