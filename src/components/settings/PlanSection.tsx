import { useEffect, useState } from 'react'
import {
  BILLING_LIVE,
  NO_SUBSCRIPTION,
  describeSubscription,
  getSubscription,
  hasAccess,
  openBillingPortal,
  startCheckout,
  type Subscription,
} from '@/lib/billing'

/**
 * Your plan.
 *
 * Nothing in the app told anyone what they were paying, when it renewed, or
 * how to stop paying. A subscription with no visible cancel path is the single
 * fastest way to earn a chargeback and a review that says the word "trap", so
 * the portal link is present the moment a subscription exists, not hidden
 * behind a support email.
 *
 * Everything about money is stated plainly here even when it is bad news:
 * a failed payment says the board still works, because it does, and a
 * cancelled plan says the date it actually ends rather than implying it has
 * already gone.
 */
export function PlanSection() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getSubscription().then(setSub)
  }, [])

  /**
   * Before the Stripe keys exist, a Subscribe button is a button that throws.
   * Say so instead. This is also what an early tester should read: they are
   * not on a trial that is about to end, they are simply not being charged.
   */
  if (!BILLING_LIVE) {
    return (
      <section className="settings-section">
        <h3 className="settings-section-title">Plan</h3>
        <p className="settings-section-copy">
          Billing is not switched on yet, so nothing is charging you and there is no card on
          this account. When it is, songdrafts is $49 a year, or $9 a month, and you will be
          asked before anything is taken.
        </p>
      </section>
    )
  }

  const current = sub ?? NO_SUBSCRIPTION
  const active = hasAccess(current)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reach billing. Nothing was charged. Try again in a moment.',
      )
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Plan</h3>

      {sub === null ? (
        <p className="settings-section-copy">Checking…</p>
      ) : (
        <>
          <p className="settings-plan-status" data-state={active ? 'on' : 'off'}>
            {describeSubscription(current)}
          </p>

          {active ? (
            <>
              <p className="settings-field-note">
                Change your card, switch between monthly and yearly, download receipts, or
                cancel. Cancelling keeps your board until the date above.
              </p>
              <button
                type="button"
                className="settings-export"
                disabled={busy}
                onClick={() => void run(openBillingPortal)}
              >
                {busy ? 'Opening…' : 'Manage billing'}
              </button>
            </>
          ) : (
            <>
              <p className="settings-field-note">
                Your songs stay on this device either way. A plan is what syncs them between
                devices and keeps them backed up.
              </p>
              <div className="reminder-row">
                <button
                  type="button"
                  className="settings-install-btn"
                  disabled={busy}
                  onClick={() => void run(() => startCheckout('year'))}
                >
                  $49 a year
                </button>
                <button
                  type="button"
                  className="settings-export"
                  disabled={busy}
                  onClick={() => void run(() => startCheckout('month'))}
                >
                  $9 a month
                </button>
              </div>
              <p className="settings-field-note">First week is $1. Cancel any time.</p>
            </>
          )}

          {error && <p className="settings-avatar-error">{error}</p>}
        </>
      )}
    </section>
  )
}
