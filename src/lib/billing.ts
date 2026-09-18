import { supabase } from '@/lib/supabase/client'
import { PRICE_TABLE, type Currency, getPreferredCurrency } from '@/lib/currency'
import { adConsentForCheckout, trackPixelEvent } from '@/lib/metaPixel'
import { trackGa4BeginCheckout } from '@/lib/ga4'
import { PRICES } from './prices'

/**
 * Billing, from the app's side.
 *
 * The app asks exactly one question: does this person have access right now.
 * Everything else (cards, invoices, receipts, changing plan, cancelling) is
 * Stripe's billing portal, because rebuilding that badly is a large amount of
 * work for a worse result and one more place to leak a card detail.
 */

/**
 * Is billing actually switched on?
 *
 * Stripe's keys live on the edge functions, not in the bundle, so the app
 * cannot detect this for itself: an unconfigured checkout looks exactly like a
 * network failure from here. Rather than showing a Subscribe button that
 * throws, this states plainly that nobody is being charged yet.
 *
 * Flip to true on the same day the Stripe keys are set. It is deliberately
 * separate from SIGNUPS_OPEN: signups can open before billing, or after.
 */
export const BILLING_LIVE = true

/** Accounts created before this are free for good (Owen and early testers). */
export const PAYWALL_FROM = '2026-09-18T00:00:00Z'

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

/* The prices and the founding flag live in prices.ts (no imports), so the
   landing page can show them without downloading the Supabase client. */
export { PRICES, FOUNDING_CAP, FOUNDING_OFFER, FOUNDING_TERMS } from './prices'

/** Days after the first payment in which the Settings refund button works. */
// 18 Sept, Owen: 30 days on both, no questions. Mirrors stripe-checkout.
export const REFUND_DAYS = { year: 30, month: 30 } as const

export type PlanChoice = 'founding' | 'year' | 'month'
export type Plan = 'founding_year' | 'year' | 'month'

export interface Subscription {
  status: SubscriptionStatus
  plan: Plan | null
  planInterval: 'month' | 'year' | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  firstPaidAt: string | null
  refundedAt: string | null
}

export const NO_SUBSCRIPTION: Subscription = {
  status: 'none',
  plan: null,
  planInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  firstPaidAt: null,
  refundedAt: null,
}

/**
 * Does this subscription grant access?
 *
 * `past_due` counts as access ON PURPOSE. A card that failed at 3am is
 * overwhelmingly a expired card rather than a decision to leave, and locking
 * someone out of their own songs over it, before Stripe has even finished
 * retrying, is a way to lose a customer you had already won. Stripe chases
 * them; we keep the door open until it gives up and moves them to `unpaid` or
 * `canceled`.
 *
 * The date is checked as well as the status, so a webhook we never received
 * cannot leave someone with permanent free access, and a webhook that arrives
 * late cannot lock out someone who has paid.
 */
export function hasAccess(sub: Subscription | null): boolean {
  if (!sub) return false
  if (!['trialing', 'active', 'past_due'].includes(sub.status)) return false
  if (!sub.currentPeriodEnd) return true
  return new Date(sub.currentPeriodEnd).getTime() > Date.now()
}

export async function getSubscription(): Promise<Subscription> {
  if (!supabase) return NO_SUBSCRIPTION
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, plan, plan_interval, current_period_end, cancel_at_period_end, first_paid_at, refunded_at')
    .maybeSingle()

  if (error || !data) return NO_SUBSCRIPTION

  const row = data as {
    status: SubscriptionStatus
    plan: Plan | null
    plan_interval: 'month' | 'year' | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    first_paid_at: string | null
    refunded_at: string | null
  }

  return {
    status: row.status,
    plan: row.plan,
    planInterval: row.plan_interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    firstPaidAt: row.first_paid_at,
    refundedAt: row.refunded_at,
  }
}

/**
 * Is the refund button live, and until when? The server checks again and has
 * the final say; this only decides whether to show the button.
 */
export function refundWindow(sub: Subscription): { open: boolean; until: Date | null } {
  if (!hasAccess(sub) || sub.refundedAt || !sub.firstPaidAt) return { open: false, until: null }
  const days = sub.planInterval === 'month' ? REFUND_DAYS.month : REFUND_DAYS.year
  const until = new Date(new Date(sub.firstPaidAt).getTime() + days * 86_400_000)
  return { open: until.getTime() > Date.now(), until }
}

/** How many of the 100 founding places are left. Null if it cannot be read. */
export async function getFoundingPlacesLeft(): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('founding_places_left')
  if (error || typeof data !== 'number') return null
  return data
}

/** Can the signed-in person still take a founding place? */
export async function isFoundingEligible(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('my_founding_eligible')
  return !error && data === true
}

/** A reply from the billing function the app knows how to say plainly. */
export class BillingError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

const BILLING_MESSAGES: Record<string, string> = {
  already_subscribed: 'You already have a plan. Manage it from Settings.',
  founding_full: 'The 100 founding places have all gone. Nothing was charged.',
  founding_off: 'The founding price is not available. Nothing was charged.',
  founding_not_eligible:
    'Founding places are for a first subscription only, so it is $79 a year now. Nothing was charged.',
  promo_invalid: 'That code is not valid or has been used. Remove it to carry on without one.',
}

async function callBilling<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Sign in required')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to continue.')

  const { data: result, error } = await supabase.functions.invoke('stripe-checkout', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    /* supabase-js reports every non-2xx as one generic message. The function
       says what actually happened, so read that first. */
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const payload = (await ctx.clone().json().catch(() => null)) as { error?: string } | null
      const code = payload?.error ?? null
      if (code) throw new BillingError(BILLING_MESSAGES[code] ?? code, code)
    }
    throw new BillingError('Could not reach billing. Nothing was charged. Try again in a moment.', null)
  }
  return result as T
}

async function billingUrl(body: Record<string, unknown>): Promise<string> {
  const result = await callBilling<{ url?: string }>(body)
  if (!result?.url) throw new Error('Could not start checkout.')
  return result.url
}

/**
 * Send them to Stripe to subscribe. The price is chosen server side; this
 * only asks for it in a currency, and a partner code if the visitor has one.
 */
/** What a code does, checked with Stripe before checkout. */
export interface PromoCheck {
  valid: boolean
  /** Takes the whole price off: a free year. */
  free?: boolean
  percentOff?: number | null
  amountOff?: number | null
}

export async function checkPromo(code: string): Promise<PromoCheck> {
  return callBilling<PromoCheck>({ mode: 'promo', promo: code })
}

export async function startCheckout(
  plan: PlanChoice,
  options?: { currency?: Currency; promo?: string | null },
): Promise<void> {
  const currency = options?.currency ?? getPreferredCurrency()
  const amount = currency === 'gbp' ? PRICE_TABLE.gbp[plan === 'month' ? 'month' : 'year'] : PRICES[plan].amount
  const consent = adConsentForCheckout()
  let promo: string | null = options?.promo ?? null
  if (options?.promo === undefined) {
    try {
      promo = localStorage.getItem('sd_promo')
    } catch {
      // No storage: no code to pre-apply, the checkout page still takes one.
    }
  }
  trackPixelEvent('InitiateCheckout', {
    content_name: plan,
    value: amount,
    currency: currency.toUpperCase(),
  })
  trackGa4BeginCheckout(plan, amount, currency.toUpperCase())
  try {
    window.location.href = await billingUrl({
      mode: 'checkout',
      plan,
      currency,
      ...(promo ? { promo } : {}),
      ...consent,
    })
  } catch (err) {
    // A stale code saved on this device must not block paying for good.
    if (err instanceof BillingError && err.code === 'promo_invalid' && options?.promo === undefined) {
      try {
        localStorage.removeItem('sd_promo')
      } catch {
        /* nothing saved */
      }
      throw new BillingError('That code is not valid, so it was removed. Press again to carry on.', err.code)
    }
    throw err
  }
}

/** Send them to Stripe to change their card, see receipts or cancel. */
export async function openBillingPortal(): Promise<void> {
  window.location.href = await billingUrl({ mode: 'portal' })
}

/** The Settings refund button. Refunds the first payment and ends the plan. */
export async function requestRefund(): Promise<{ amount: number; currency: string }> {
  return callBilling<{ amount: number; currency: string }>({ mode: 'refund' })
}

/** What a finished checkout charged, for the browser's copy of the Purchase. */
export async function getCheckoutReceipt(
  sessionId: string,
): Promise<{ paid: boolean; eventId?: string; value?: number; currency?: string; plan?: string }> {
  return callBilling({ mode: 'receipt', sessionId })
}

/** Plain English for the settings panel. Never a raw Stripe status. */
export function describeSubscription(sub: Subscription): string {
  const until = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  switch (sub.status) {
    case 'trialing':
    case 'active': {
      const name =
        sub.plan === 'founding_year'
          ? 'Founding, $49 a year'
          : sub.planInterval === 'month'
            ? '$12 a month'
            : '$79 a year'
      if (sub.cancelAtPeriodEnd) return until ? `${name}. Ends ${until}` : `${name}. Ends soon`
      return until ? `${name}. Renews ${until}` : name
    }
    case 'past_due':
      return 'Payment failed. Your board still works while Stripe retries.'
    case 'unpaid':
    case 'canceled':
    case 'incomplete_expired':
      return 'Not subscribed'
    case 'paused':
      return 'Paused'
    case 'incomplete':
      return 'Waiting for payment to confirm'
    default:
      return 'Not subscribed'
  }
}
