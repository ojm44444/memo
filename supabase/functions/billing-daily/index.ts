import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno'
import { capiContextFromMetadata, sendCapiEvent } from '../_shared/metaCapi.ts'

/**
 * Once a day: report annual subscribers who reached day 30 without a refund.
 *
 * "Retained" is a REPORTING event, read per cohort to see whether the buyers
 * the ads found actually stayed. It is never what campaigns optimise on: a
 * day 30 event falls outside Meta's 7 day click window, so the algorithm
 * would learn from almost nothing. Monthly subscribers are reported by the
 * webhook when their second payment succeeds; annual ones have no second
 * payment for a year, so this job covers them.
 *
 * Only sent for people who allowed ads measurement at checkout (the consent
 * is on the Stripe subscription's metadata). Everyone else is marked as
 * reported without anything being sent, so they are not looked at again.
 *
 * Not callable by the browser: the same shared secret header as
 * retention-sweep, and scheduled by the same migration (028).
 */

serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('LIFECYCLE_EMAIL_SECRET')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')

  if (!url || !serviceKey || !secret || !stripeKey) {
    return new Response(JSON.stringify({ error: 'Billing job is not configured' }), { status: 503 })
  }
  if (req.headers.get('x-lifecycle-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const admin = createClient(url, serviceKey)
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' })

  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: due, error } = await admin
    .from('subscriptions')
    .select('user_id, stripe_subscription_id, plan')
    .in('plan', ['founding_year', 'year'])
    .in('status', ['active', 'past_due'])
    .lte('first_paid_at', cutoff)
    .is('refunded_at', null)
    .is('retained_reported_at', null)
    .limit(500)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const outcome = { due: due?.length ?? 0, sent: 0, noConsent: 0, failed: 0, dry }
  if (dry) return new Response(JSON.stringify(outcome), { headers: { 'Content-Type': 'application/json' } })

  for (const row of due ?? []) {
    if (!row.stripe_subscription_id) continue
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      const { data: userData } = await admin.auth.admin.getUserById(row.user_id)
      const result = await sendCapiEvent(
        capiContextFromMetadata(sub.metadata, { userId: row.user_id, email: userData?.user?.email }),
        { name: 'Retained', eventId: `retained-${sub.id}`, custom: { plan: row.plan ?? 'year' } },
      )
      if (result === 'failed' || result === 'not_configured') {
        outcome.failed++
        continue
      }
      if (result === 'sent') outcome.sent++
      else outcome.noConsent++
      await admin
        .from('subscriptions')
        .update({ retained_reported_at: new Date().toISOString() })
        .eq('user_id', row.user_id)
    } catch (err) {
      outcome.failed++
      console.error(`retained ${row.user_id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  return new Response(JSON.stringify(outcome), { headers: { 'Content-Type': 'application/json' } })
})
