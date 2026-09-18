import { type ReactNode, useEffect, useState } from 'react'
import {
  BILLING_LIVE,
  PAYWALL_FROM,
  PRICES,
  getSubscription,
  hasAccess,
  startCheckout,
  type PlanChoice,
} from '@/lib/billing'
import { supabase } from '@/lib/supabase/client'

const ACCESS_KEY = 'sd-plan-access'
const ACCESS_GRACE_MS = 3 * 86_400_000

function rememberAccess(userId: string) {
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify({ userId, at: Date.now() }))
  } catch {
    // Private mode: the check just runs every time.
  }
}

/**
 * Seen with access on this device in the last few days. Only ever used when
 * the lookup says "none", which a network failure also says; the database
 * still enforces the paywall on the cloud data itself.
 */
function hadAccessRecently(userId: string): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? 'null') as { userId?: string; at?: number } | null
    return saved?.userId === userId && typeof saved.at === 'number' && Date.now() - saved.at < ACCESS_GRACE_MS
  } catch {
    return false
  }
}

/**
 * Pay to use (17 Sept, Owen, before posting on Reddit). New accounts choose
 * a plan before the app opens. Free for: anyone whose account existed before
 * PAYWALL_FROM (Owen, testers), anyone marked comped in app_metadata (only
 * the server can set that), and every listener on a share link, which never
 * passes through here. Offline, the app opens: it cannot check, and the music
 * on this device is theirs.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'needs' | 'ok'>(BILLING_LIVE ? 'checking' : 'ok')
  const [plan, setPlan] = useState<PlanChoice>('year')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const returning = new URLSearchParams(window.location.search).get('checkout') === 'done'

  useEffect(() => {
    if (!BILLING_LIVE || !supabase) return
    let live = true
    let settled = false
    const settle = (next: 'ok' | 'needs') => {
      if (settled) return
      settled = true
      if (live) setState(next)
    }
    /**
     * Offline means more than navigator.onLine === false. On a weak signal the
     * phone reports online and these requests hang or fail, and the board sat
     * on "Loading your board…", or a paying account was shown the plan screen
     * because a failed lookup reads as "no subscription". So: a time limit,
     * failures open the board, and an account this device has already seen
     * with access keeps it when the lookup cannot answer.
     */
    const timer = returning ? null : setTimeout(() => settle('ok'), 6000)
    void (async () => {
      if (!navigator.onLine) return settle('ok')
      const { data } = await supabase!.auth.getUser()
      const user = data.user
      if (!user) return settle('ok')
      const comped = user.app_metadata?.comped === true
      const early = new Date(user.created_at).getTime() < new Date(PAYWALL_FROM).getTime()
      if (comped || early) return settle('ok')
      // Just paid: the webhook can take a few seconds to record it.
      for (let i = 0; i < (returning ? 15 : 1); i++) {
        if (hasAccess(await getSubscription())) {
          rememberAccess(user.id)
          return settle('ok')
        }
        if (returning) await new Promise((r) => setTimeout(r, 2000))
      }
      settle(hadAccessRecently(user.id) && !returning ? 'ok' : 'needs')
    })().catch(() => settle('ok'))
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [returning])

  if (state === 'ok') return <>{children}</>
  if (state === 'checking') {
    return (
      <div className="auth-gate-loading">
        <p>{returning ? 'Confirming your payment…' : 'Loading your board…'}</p>
      </div>
    )
  }

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await startCheckout(plan)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open checkout. Nothing was charged.')
      setBusy(false)
    }
  }

  const perMonth = (PRICES.year.amount / 12).toFixed(2)

  return (
    <div className="plan-gate">
      <div className="plan-gate-card">
        <p className="rec-eyebrow">One step left</p>
        <h1 className="plan-gate-title">Choose your plan</h1>
        <p className="plan-gate-sub">
          Everything: the songwriting board, Listen playlists, share links, offline, lossless.
        </p>

        <div className="plan-gate-options" role="radiogroup" aria-label="Plan">
          <button
            type="button"
            role="radio"
            aria-checked={plan === 'year'}
            className={`plan-gate-option${plan === 'year' ? ' is-on' : ''}`}
            onClick={() => setPlan('year')}
          >
            <span className="plan-gate-option-name">Yearly</span>
            <span className="plan-gate-option-price">${PRICES.year.amount} a year</span>
            <span className="plan-gate-option-note">${perMonth} a month</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={plan === 'month'}
            className={`plan-gate-option${plan === 'month' ? ' is-on' : ''}`}
            onClick={() => setPlan('month')}
          >
            <span className="plan-gate-option-name">Monthly</span>
            <span className="plan-gate-option-price">${PRICES.month.amount} a month</span>
            <span className="plan-gate-option-note">Cancel anytime</span>
          </button>
        </div>

        <button type="button" className="plan-gate-go" disabled={busy} onClick={() => void go()}>
          {busy ? 'Opening checkout…' : 'Continue'}
        </button>
        {error && <p className="plan-gate-error">{error}</p>}
        <p className="plan-gate-foot">
          Cancel anytime in Settings. Anyone you share a link with listens free.
        </p>
        <button
          type="button"
          className="plan-gate-signout"
          onClick={() => {
            void supabase?.auth.signOut({ scope: 'local' }).then(() => window.location.assign('/'))
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
