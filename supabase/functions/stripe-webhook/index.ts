import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

/**
 * The Stripe webhook. The only thing that may write a subscription row.
 *
 * THE SIGNATURE CHECK IS THE WHOLE SECURITY MODEL. This endpoint is public,
 * it runs as service role, and it grants paid access. Without verification
 * anyone who found the URL could POST themselves a lifetime subscription, so
 * an unverified payload is refused before anything is read out of it.
 *
 * Note constructEventAsync, not constructEvent: the sync version uses node
 * crypto and throws on Deno. That one line is the usual reason a Stripe
 * webhook "works locally and 400s in production".
 *
 * Idempotent by design. Stripe retries, and it can deliver out of order, so
 * every handler is a full upsert of current state rather than a mutation of
 * whatever happens to be in the row. Replaying yesterday's event does not
 * resurrect yesterday's status.
 */

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

  /** Write the whole state from the subscription object. */
  const applySubscription = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

    // Prefer the id we stamped on at checkout; fall back to the customer, in
    // case an early subscription was created in the Stripe dashboard by hand.
    let userId = sub.metadata?.supabase_user_id ?? null
    if (!userId) {
      const { data } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      userId = data?.user_id ?? null
    }
    if (!userId) return

    const item = sub.items.data[0]
    const interval = item?.price?.recurring?.interval
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end

    await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan_interval: interval === 'month' || interval === 'year' ? interval : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const id =
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          await applySubscription(await stripe.subscriptions.retrieve(id))
        }
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
        // Re-read rather than infer. An invoice tells you what happened to a
        // payment, not what the subscription's status now is.
        const invoice = event.data.object as unknown as { subscription?: string | null }
        if (invoice.subscription) {
          await applySubscription(await stripe.subscriptions.retrieve(invoice.subscription))
        }
        break
      }

      default:
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // 500 so Stripe retries. Swallowing this would lose the event silently and
    // leave someone paid-up in Stripe and locked out here.
    return new Response(`Handler failed: ${err instanceof Error ? err.message : ''}`, {
      status: 500,
    })
  }
})
