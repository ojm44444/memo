import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { capiContextFromMetadata, sendCapiEvent } from '../_shared/metaCapi.ts'

/**
 * The Stripe webhook. The only thing that may write a subscription row, and
 * the only thing that makes a founding place permanent.
 *
 * THE SIGNATURE CHECK IS THE WHOLE SECURITY MODEL. This endpoint is public,
 * it runs as service role, and it grants paid access. An unverified payload is
 * refused before anything is read out of it. constructEventAsync, not
 * constructEvent: the sync one uses node crypto and throws on Deno.
 *
 * Idempotent by design. Stripe retries and can deliver out of order, so every
 * handler writes current state rather than mutating whatever is in the row.
 *
 * Subscribe the endpoint to: checkout.session.completed,
 * checkout.session.expired, customer.subscription.created / updated /
 * deleted / paused / resumed, invoice.payment_succeeded,
 * invoice.payment_failed, charge.refunded.
 *
 * GONE (15 Sept): the $1 first week and the 7 day trial, and with them the
 * trial_will_end reminder. Checkout now charges the full price up front.
 */

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }
const LIVE_STATUSES = ['trialing', 'active', 'past_due']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const foundingPrice = Deno.env.get('STRIPE_PRICE_FOUNDING_YEAR')

  if (!stripeKey || !webhookSecret || !url || !serviceKey) {
    return new Response('Not configured', { status: 503 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret)
  } catch (err) {
    return new Response(`Bad signature: ${err instanceof Error ? err.message : ''}`, { status: 400 })
  }

  const admin = createClient(url, serviceKey)
  const now = () => new Date().toISOString()

  const customerIdOf = (sub: Stripe.Subscription) =>
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  /** Whose subscription is this? The id stamped at checkout, else the customer. */
  const userIdFor = async (sub: Stripe.Subscription): Promise<string | null> => {
    if (sub.metadata?.supabase_user_id) return sub.metadata.supabase_user_id
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerIdOf(sub))
      .maybeSingle()
    return data?.user_id ?? null
  }

  const planOf = (sub: Stripe.Subscription): 'founding_year' | 'year' | 'month' | null => {
    const price = sub.items.data[0]?.price
    if (!price) return null
    if (foundingPrice && price.id === foundingPrice) return 'founding_year'
    if (price.recurring?.interval === 'month') return 'month'
    if (price.recurring?.interval === 'year') return 'year'
    return null
  }

  /** Write the whole state from the subscription object. */
  const applySubscription = async (sub: Stripe.Subscription) => {
    const userId = await userIdFor(sub)
    if (!userId) return

    // Only one live subscription per person. Two open checkout pages could
    // both be paid; the second one is cancelled and refunded here rather than
    // quietly billing someone twice.
    if (LIVE_STATUSES.includes(sub.status)) {
      const { data: existing } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id, status, current_period_end')
        .eq('user_id', userId)
        .maybeSingle()
      const otherLive =
        existing?.stripe_subscription_id &&
        existing.stripe_subscription_id !== sub.id &&
        LIVE_STATUSES.includes(existing.status) &&
        (!existing.current_period_end || new Date(existing.current_period_end).getTime() > Date.now())
      if (otherLive) {
        await refundAndCancelDuplicate(sub)
        return
      }
    }

    const item = sub.items.data[0]
    const interval = item?.price?.recurring?.interval
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end

    await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: customerIdOf(sub),
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan: planOf(sub),
        plan_interval: interval === 'month' || interval === 'year' ? interval : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        updated_at: now(),
      },
      { onConflict: 'user_id' },
    )

    // A founding place lasts exactly as long as the subscription. Once it has
    // ended it is released and never comes back to this person.
    if (['canceled', 'incomplete_expired', 'unpaid'].includes(sub.status)) {
      const { data: row } = await admin
        .from('subscriptions')
        .select('refunded_at')
        .eq('user_id', userId)
        .maybeSingle()
      await admin
        .from('founding_places')
        .update({
          status: 'released',
          released_at: now(),
          release_reason: row?.refunded_at ? 'refunded' : 'ended',
        })
        .eq('stripe_subscription_id', sub.id)
        .neq('status', 'released')
    }
  }

  const refundAndCancelDuplicate = async (sub: Stripe.Subscription) => {
    const paid = await stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 })
    const pi = paid.data[0]?.payment_intent
    const paymentIntent = typeof pi === 'string' ? pi : pi?.id
    if (paymentIntent) {
      await stripe.refunds.create(
        { payment_intent: paymentIntent, metadata: { reason: 'duplicate_subscription' } },
        { idempotencyKey: `dup-refund-${sub.id}` },
      )
    }
    if (sub.status !== 'canceled') {
      await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false })
    }
    console.error(`duplicate subscription ${sub.id} cancelled and refunded`)
  }

  const emailFor = async (userId: string) => {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (!session.subscription) break
        const subId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const sub = await stripe.subscriptions.retrieve(subId)

        // The held place becomes theirs. Keyed on the place id the checkout
        // stamped, not on "any hold of this user's", so a stale page cannot
        // activate a place it was not given.
        const placeId = session.metadata?.founding_place_id
        if (placeId) {
          const { data: place } = await admin
            .from('founding_places')
            .update({
              status: 'active',
              activated_at: now(),
              stripe_subscription_id: subId,
              stripe_checkout_session_id: session.id,
              held_until: null,
              released_at: null,
              release_reason: null,
            })
            .eq('id', placeId)
            .select('id')
            .maybeSingle()
          if (!place) console.error(`founding place ${placeId} missing for ${session.id}`)
        }

        await applySubscription(sub)

        // The server copy of the browser's Purchase, same event id, so Meta
        // counts it once. Only for someone who allowed ads measurement.
        if (session.payment_status === 'paid') {
          const userId = session.client_reference_id
          const result = await sendCapiEvent(
            capiContextFromMetadata(session.metadata, {
              userId,
              email: session.customer_details?.email ?? (userId ? await emailFor(userId) : null),
            }),
            {
              name: 'Purchase',
              eventId: session.id,
              time: session.created,
              value: (session.amount_total ?? 0) / 100,
              currency: session.currency ?? 'usd',
              custom: { content_name: session.metadata?.plan ?? 'year' },
            },
          )
          if (result === 'failed') console.error(`CAPI Purchase not sent for ${session.id}`)
        }
        break
      }

      case 'checkout.session.expired': {
        // They closed the Stripe page. The place goes back, unless it has
        // already moved on to a newer checkout (see stripe-checkout).
        const session = event.data.object as Stripe.Checkout.Session
        await admin
          .from('founding_places')
          .update({ status: 'released', released_at: now(), release_reason: 'checkout_expired' })
          .eq('stripe_checkout_session_id', session.id)
          .eq('status', 'held')
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await applySubscription(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded': {
        // Re-read rather than infer: an invoice says what happened to a
        // payment, not what the subscription's status now is.
        const invoice = event.data.object as unknown as {
          subscription?: string | null
          billing_reason?: string
          status_transitions?: { paid_at?: number | null }
          id: string
        }
        if (!invoice.subscription) break
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        await applySubscription(sub)

        if (event.type !== 'invoice.payment_succeeded') break
        const userId = await userIdFor(sub)
        if (!userId) break

        if (invoice.billing_reason === 'subscription_create') {
          const paidAt = invoice.status_transitions?.paid_at
          await admin
            .from('subscriptions')
            .update({ first_paid_at: new Date((paidAt ?? Date.now() / 1000) * 1000).toISOString() })
            .eq('user_id', userId)
            .is('first_paid_at', null)
        }

        /* Retained, for reporting only (never an optimisation event: it lands
           outside Meta's 7 day attribution window). Monthly: the second
           payment went through. Annual: day 30 without a refund, which needs
           the daily job, see billing-daily. */
        if (invoice.billing_reason === 'subscription_cycle' && planOf(sub) === 'month') {
          const { data: row } = await admin
            .from('subscriptions')
            .select('retained_reported_at')
            .eq('user_id', userId)
            .maybeSingle()
          if (!row?.retained_reported_at) {
            const result = await sendCapiEvent(
              capiContextFromMetadata(sub.metadata, { userId, email: await emailFor(userId) }),
              { name: 'Retained', eventId: `retained-${sub.id}`, custom: { plan: 'month' } },
            )
            if (result === 'sent' || result === 'no_consent') {
              await admin
                .from('subscriptions')
                .update({ retained_reported_at: now() })
                .eq('user_id', userId)
            }
          }
        }
        break
      }

      case 'charge.refunded': {
        // A refund issued outside the app (the Stripe dashboard) is still a
        // refund. The place is released when the subscription ends.
        const charge = event.data.object as Stripe.Charge
        if (!charge.refunded) break
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id
        if (!invoiceId) break
        const invoice = await stripe.invoices.retrieve(invoiceId)
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
        if (!subId) break
        await admin
          .from('subscriptions')
          .update({ refunded_at: now() })
          .eq('stripe_subscription_id', subId)
          .is('refunded_at', null)
        break
      }

      default:
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // 500 so Stripe retries. Swallowing this would lose the event and leave
    // someone paid up in Stripe and locked out here.
    return new Response(`Handler failed: ${err instanceof Error ? err.message : ''}`, {
      status: 500,
    })
  }
})
