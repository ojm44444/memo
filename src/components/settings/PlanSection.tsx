import { useEffect, useState } from 'react'
import {
  BILLING_LIVE,
  FOUNDING_CAP,
  FOUNDING_OFFER,
  FOUNDING_TERMS,
  NO_SUBSCRIPTION,
  PAYWALL_FROM,
  PRICES,
  REFUND_DAYS,
  describeSubscription,
  getFoundingPlacesLeft,
  getSubscription,
  hasAccess,
  isFoundingEligible,
  openBillingPortal,
  refundWindow,
  requestRefund,
  startCheckout,
  type PlanChoice,
  type Subscription,
} from '@/lib/billing'
import { PRICE_TABLE, getPreferredCurrency, money, type Currency } from '@/lib/currency'
import { supabase } from '@/lib/supabase/client'
import '@/styles/onboarding.css'

const longDate = (date: Date) =>
  date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** Comped or created before the paywall: free for good, as PlanGate and the database agree. */
async function isFreeForGood(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return false
  if (user.app_metadata?.comped === true) return true
  return new Date(user.created_at).getTime() < new Date(PAYWALL_FROM).getTime()
}

/**
 * Plan and billing.
 *
 * What you pay, when it renews, how to stop, and the refund, all in one
 * place. A subscription with no visible way out is the fastest way to a
 * chargeback, so Manage billing is here the moment a plan exists, and the
 * refund is a button rather than an email to write.
 *
 * The founding price is offered only while places are left and only to
 * someone who has never had one, and its condition is said next to the
 * button, before anyone reaches Stripe (and again on the Stripe page).
 */
export function PlanSection() {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [placesLeft, setPlacesLeft] = useState<number | null>(null)
  const [eligible, setEligible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refunded, setRefunded] = useState<string | null>(null)
  // Comped and early accounts are free for good (PlanGate and the database
  // agree): no subscription, so nothing to cancel and nothing to buy.
  const [freeForGood, setFreeForGood] = useState(false)
  // Display only, and the same choice the landing page remembered. Passed to
  // checkout so the price on the button is the price on the card.
  const [currency] = useState<Currency>(getPreferredCurrency)
  const table = PRICE_TABLE[currency]

  useEffect(() => {
    if (!BILLING_LIVE) return
    let live = true
    void Promise.all([
      getSubscription(),
      FOUNDING_OFFER ? getFoundingPlacesLeft() : Promise.resolve(0),
      FOUNDING_OFFER ? isFoundingEligible() : Promise.resolve(false),
      isFreeForGood(),
    ]).then(
      ([nextSub, left, canFound, free]) => {
        if (!live) return
        setSub(nextSub)
        setPlacesLeft(left)
        setEligible(canFound)
        setFreeForGood(free)
      },
    )
    return () => {
      live = false
    }
  }, [])

  if (!BILLING_LIVE) {
    return (
      <section className="settings-section">
        <h3 className="settings-section-title">Plan</h3>
        <p className="settings-section-copy">
          {`Billing is not on yet, so nothing is charging you. When it is: ${money(currency, table.year)} a year or ${money(currency, table.month)} a month.`}
          {FOUNDING_OFFER &&
            ` The first ${FOUNDING_CAP} yearly plans are $${PRICES.founding.amount}.`}
        </p>
      </section>
    )
  }

  const current = sub ?? NO_SUBSCRIPTION
  const active = hasAccess(current)
  const refund = refundWindow(current)
  const showFounding = FOUNDING_OFFER && !active && eligible && (placesLeft ?? 0) > 0

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach billing. Nothing was charged.')
      setBusy(false)
    }
  }

  const checkout = (plan: PlanChoice) =>
    // The currency argument is being added to startCheckout in parallel; cast
    // until it lands rather than edit billing.ts from here.
    run(() =>
      (startCheckout as (p: PlanChoice, o?: { currency?: Currency }) => Promise<void>)(plan, {
        currency,
      }),
    )

  const takeRefund = () =>
    run(async () => {
      const result = await requestRefund()
      const amount = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: result.currency,
      }).format(result.amount)
      setRefunded(`Refunded ${amount}. Your plan has ended. Banks take 5 to 10 days to show it.`)
      setRefundOpen(false)
      setSub(await getSubscription())
      setBusy(false)
    })

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Plan</h3>

      {sub === null ? (
        <p className="settings-section-copy">Checking…</p>
      ) : active ? (
        <>
          <p className="settings-plan-status" data-state="on">
            {describeSubscription(current)}
          </p>
          {current.cancelAtPeriodEnd ? (
            <p className="settings-field-note">
              Cancelled. You keep everything until the date above. Changed your mind? Manage
              billing to keep your plan.
            </p>
          ) : (
            /* 18 Sept, Owen: cancelling "needs to be a bit more obvious". Its
               own button, not a line inside Manage billing. Stripe's portal
               cancels at the end of the period. */
            <div className="plan-cancel">
              <button
                type="button"
                className="ob-pill is-quiet plan-cancel-btn"
                disabled={busy}
                onClick={() => void run(openBillingPortal)}
              >
                Cancel plan
              </button>
              <p className="settings-field-note">
                You keep everything until the end of the period you’ve paid for.
                {current.plan === 'founding_year' ? ' Cancel and it is $79 a year if you come back.' : ''}
              </p>
            </div>
          )}
          <div className="reminder-row">
            <button
              type="button"
              className="settings-export"
              disabled={busy}
              onClick={() => void run(openBillingPortal)}
            >
              {busy && !refundOpen ? 'Opening…' : 'Manage billing'}
            </button>
            {refund.open && !refundOpen && (
              <button
                type="button"
                className="settings-avatar-clear"
                onClick={() => setRefundOpen(true)}
              >
                Get a refund
              </button>
            )}
          </div>
          <p className="settings-field-note">Manage billing: change card or see receipts.</p>

          {refund.open && refundOpen && refund.until && (
            <div className="settings-everywhere">
              <p className="settings-field-note" style={{ marginTop: 0 }}>
                Full refund, and your plan ends now. Songs on this device stay. Open until{' '}
                {longDate(refund.until)}.
              </p>
              <div className="reminder-row" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className="settings-delete-confirm"
                  disabled={busy}
                  onClick={() => void takeRefund()}
                >
                  {busy ? 'Refunding…' : 'Refund and end plan'}
                </button>
                <button
                  type="button"
                  className="settings-avatar-clear"
                  onClick={() => setRefundOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      ) : freeForGood ? (
        <p className="settings-plan-status" data-state="on">
          Free for good on this account. Nothing is charging you.
        </p>
      ) : (
        <>
          {refunded && <p className="settings-import-result">{refunded}</p>}
          {!refunded && current.refundedAt && (
            <p className="settings-field-note">Refunded. No plan right now.</p>
          )}
          <p className="settings-field-note">
            Your songs stay on this device either way. A plan syncs them and backs them up.
          </p>

          {showFounding && (
            <div className="settings-founding">
              <button
                type="button"
                className="settings-install-btn"
                disabled={busy}
                onClick={() => void checkout('founding')}
              >
                ${PRICES.founding.amount} a year, founding
              </button>
              <p className="settings-field-note">
                {FOUNDING_TERMS} {placesLeft} of {FOUNDING_CAP} left.
              </p>
            </div>
          )}

          <div className="reminder-row">
            <button
              type="button"
              className={showFounding ? 'settings-export' : 'settings-install-btn'}
              disabled={busy}
              onClick={() => void checkout('year')}
            >
              {money(currency, table.year)} a year
            </button>
            <button
              type="button"
              className="settings-export"
              disabled={busy}
              onClick={() => void checkout('month')}
            >
              {money(currency, table.month)} a month
            </button>
          </div>
          {/* 18 Sept: one guarantee, 30 days, yearly or monthly. Written
              from REFUND_DAYS so it cannot drift from what the refund
              button actually allows. */}
          <p className="settings-field-note">
            {REFUND_DAYS.year === REFUND_DAYS.month
              ? `${REFUND_DAYS.year} days, refunded if it's not for you. Full refund of your first payment, no questions.`
              : `Full refund within ${REFUND_DAYS.year} days on yearly, ${REFUND_DAYS.month} days on your first month.`}
          </p>
        </>
      )}

      {error && <p className="settings-avatar-error">{error}</p>}
    </section>
  )
}
