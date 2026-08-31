import { supabase } from '@/lib/supabase/client'

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
export const BILLING_LIVE = false

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

export interface Subscription {
  status: SubscriptionStatus
  planInterval: 'month' | 'year' | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export const NO_SUBSCRIPTION: Subscription = {
  status: 'none',
  planInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
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
    .select('status, plan_interval, current_period_end, cancel_at_period_end')
    .maybeSingle()

  if (error || !data) return NO_SUBSCRIPTION

  const row = data as {
    status: SubscriptionStatus
    plan_interval: 'month' | 'year' | null
    current_period_end: string | null
    cancel_at_period_end: boolean
  }

  return {
    status: row.status,
    planInterval: row.plan_interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }
}

async function billingUrl(body: Record<string, unknown>): Promise<string> {
  if (!supabase) throw new Error('Sign in required')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to continue.')

  const { data: result, error } = await supabase.functions.invoke('stripe-checkout', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) throw error
  const url = (result as { url?: string })?.url
  if (!url) throw new Error('Could not start checkout.')
  return url
}

/** Send them to Stripe to subscribe. The price is chosen server side. */
export async function startCheckout(interval: 'month' | 'year'): Promise<void> {
  window.location.href = await billingUrl({ mode: 'checkout', interval })
}

/** Send them to Stripe to change or cancel. */
export async function openBillingPortal(): Promise<void> {
  window.location.href = await billingUrl({ mode: 'portal' })
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
      return until ? `Trial, ends ${until}` : 'Trial'
    case 'active':
      if (sub.cancelAtPeriodEnd) return until ? `Cancels on ${until}` : 'Cancels at the end of the period'
      return until ? `${sub.planInterval === 'month' ? 'Monthly' : 'Yearly'}, renews ${until}` : 'Active'
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
