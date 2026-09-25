import { type ReactNode, useEffect, useState } from 'react'
import {
  BILLING_LIVE,
  PAYWALL_FROM,
  checkPromo,
  getSubscription,
  hasAccess,
  startCheckout,
  type PlanChoice,
  type PromoCheck,
} from '@/lib/billing'
import { SupportLink } from '@/components/ui/SupportLink'
import { capturePromo, getPromo, setPromo } from '@/lib/attribution'
import {
  PRICE_TABLE,
  getPreferredCurrency,
  money,
  perMonthOfYear,
  setPreferredCurrency,
  type Currency,
} from '@/lib/currency'
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
  const [currency, setCurrency] = useState<Currency>(getPreferredCurrency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* A partner's code: from their link (?promo=CODE, kept on this device from
     the landing page, or on this address), or typed here. Checked with
     Stripe as soon as the page shows, so the person sees what it does before
     they press Continue. */
  const [promo, setPromoState] = useState<string | null>(() => {
    capturePromo()
    return getPromo()
  })
  const [promoInfo, setPromoInfo] = useState<PromoCheck | null>(null)
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoDraft, setPromoDraft] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  const returning = new URLSearchParams(window.location.search).get('checkout') === 'done'

  useEffect(() => {
    if (state !== 'needs' || !promo) return
    let live = true
    setPromoBusy(true)
    checkPromo(promo)
      .then((info) => {
        if (!live) return
        setPromoInfo(info)
        if (info.free) setPlan('year')
      })
      .catch(() => live && setPromoInfo(null))
      .finally(() => live && setPromoBusy(false))
    return () => {
      live = false
    }
  }, [state, promo])

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
      await startCheckout(plan, { currency, promo: promoInfo?.valid === false ? null : promo })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open checkout. Nothing was charged.')
      setBusy(false)
    }
  }

  const table = PRICE_TABLE[currency]
  const pickCurrency = (next: Currency) => {
    setCurrency(next)
    setPreferredCurrency(next)
  }

  const applyPromo = () => {
    const code = setPromo(promoDraft)
    setPromoInfo(null)
    setPromoState(code)
    setPromoOpen(false)
    setPromoDraft('')
    setError(null)
  }
  const removePromo = () => {
    setPromo(null)
    setPromoState(null)
    setPromoInfo(null)
    setError(null)
  }
  const free = promoInfo?.valid && promoInfo.free
  const promoLine = !promoInfo
    ? promoBusy
      ? 'Checking…'
      : 'Applied at checkout'
    : !promoInfo.valid
      ? 'Not valid, or already used'
      : promoInfo.free
        ? 'A free year'
        : promoInfo.percentOff
          ? `${promoInfo.percentOff}% off your first payment`
          : promoInfo.amountOff
            ? `${money(currency, (promoInfo.amountOff / 100).toFixed(2).replace(/\.00$/, ''))} off`
            : 'Applied at checkout'

  return (
    <div className="plan-gate">
      <div className="plan-gate-card">
        <p className="rec-eyebrow">One step left</p>
        <h1 className="plan-gate-title">Choose your plan</h1>
        <p className="plan-gate-sub">
          Everything: the songwriting board, Listen playlists, share links, offline, lossless.
        </p>

        {/* Dollars or pounds, remembered for next time, and sent to checkout
            so the page and the card agree. */}
        <div className="plan-gate-currency" role="group" aria-label="Currency">
          {(['usd', 'gbp'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={currency === c ? 'is-on' : ''}
              aria-pressed={currency === c}
              aria-label={c === 'usd' ? 'US dollars' : 'Pounds'}
              onClick={() => pickCurrency(c)}
            >
              {PRICE_TABLE[c].symbol}
            </button>
          ))}
        </div>

        <div className="plan-gate-options" role="radiogroup" aria-label="Plan">
          <button
            type="button"
            role="radio"
            aria-checked={plan === 'year'}
            className={`plan-gate-option${plan === 'year' ? ' is-on' : ''}`}
            onClick={() => setPlan('year')}
          >
            <span className="plan-gate-option-name">Yearly</span>
            <span className="plan-gate-option-price">{money(currency, table.year)} a year</span>
            <span className="plan-gate-option-note">
              {money(currency, perMonthOfYear(currency))} a month
            </span>
          </button>
          {/* A free code is a free year, so monthly is not offered with it
              (the server enforces the same). */}
          {!free && (
            <button
              type="button"
              role="radio"
              aria-checked={plan === 'month'}
              className={`plan-gate-option${plan === 'month' ? ' is-on' : ''}`}
              onClick={() => setPlan('month')}
            >
              <span className="plan-gate-option-name">Monthly</span>
              <span className="plan-gate-option-price">{money(currency, table.month)} a month</span>
              <span className="plan-gate-option-note">Billed monthly</span>
            </button>
          )}
        </div>

        {promo ? (
          <div className={`plan-gate-promo${promoInfo?.valid === false ? ' is-bad' : ''}`}>
            <span className="plan-gate-promo-code">{promo}</span>
            <span className="plan-gate-promo-what">{promoLine}</span>
            <button type="button" className="plan-gate-promo-remove" onClick={removePromo}>
              Remove
            </button>
          </div>
        ) : promoOpen ? (
          <form
            className="plan-gate-promo-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (promoDraft.trim()) applyPromo()
            }}
          >
            <input
              className="plan-gate-promo-input"
              value={promoDraft}
              onChange={(e) => setPromoDraft(e.target.value.toUpperCase())}
              placeholder="Code"
              aria-label="Code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="plan-gate-promo-apply" disabled={!promoDraft.trim()}>
              Apply
            </button>
          </form>
        ) : (
          <button type="button" className="plan-gate-promo-open" onClick={() => setPromoOpen(true)}>
            Have a code?
          </button>
        )}

        <button type="button" className="plan-gate-go" disabled={busy || promoBusy} onClick={() => void go()}>
          {busy ? 'Opening checkout…' : free ? 'Start my free year' : 'Continue'}
        </button>
        {error && <p className="plan-gate-error">{error}</p>}
        {/* The guarantee, under the button, in place of a cancel line. */}
        <p className="plan-gate-guarantee">100% money-back guarantee for 30 days.</p>
        <p className="plan-gate-foot">
          {free
            ? 'Stripe asks for a card but charges nothing today. It renews after a year unless you cancel, any time, in Settings.'
            : 'Not for you? Every penny back within 30 days, no questions. Your songs stay yours. Anyone you share a link with listens free.'}
        </p>
        <SupportLink topic="choosing a plan or paying" className="plan-gate-foot" />
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
