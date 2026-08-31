import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

/**
 * Start a checkout, or open the billing portal.
 *
 * The price is chosen HERE, from an env var, never from the request body. If
 * the client could name a price id it could name a cheaper one, and "pass the
 * plan from the front end" is the most common way a Stripe integration ends up
 * selling a year for a penny.
 *
 * One Stripe customer per user, remembered on the subscriptions row. Without
 * that, a person who checks out twice becomes two customers and the portal
 * shows them half their history.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://www.songdrafts.com'
    const priceYear = Deno.env.get('STRIPE_PRICE_YEAR')
    const priceMonth = Deno.env.get('STRIPE_PRICE_MONTH')

    if (!stripeKey || !url || !serviceKey || !priceYear || !priceMonth) {
      return json({ error: 'Billing is not configured' }, 503)
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Sign in required' }, 401)

    const admin = createClient(url, serviceKey)
    const { data: userData } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (!user?.email) return json({ error: 'Sign in required' }, 401)

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode === 'portal' ? 'portal' : 'checkout'
    const interval = body?.interval === 'month' ? 'month' : 'year'

    // Reuse the customer if we have one, so history stays in one place.
    const { data: existing } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = existing?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await admin
        .from('subscriptions')
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: 'user_id' })
    }

    if (mode === 'portal') {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteUrl}/app`,
      })
      return json({ url: portal.url })
    }

    /**
     * The $1 first week.
     *
     * Implemented as a real 7 day trial with a one-off £1 line, NOT as a
     * discounted first period. A discount would renew at the discounted price
     * if anyone ever fiddled the coupon duration, and a trial is also what
     * Stripe's own dunning and reminder emails understand.
     */
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: interval === 'month' ? priceMonth : priceYear, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id },
      },
      // Owen's line: "there is nothing here to pay with" must stop being true
      // the moment this ships, so the card IS collected up front. A trial with
      // no card is a different product decision and not this one.
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      success_url: `${siteUrl}/app?checkout=done`,
      cancel_url: `${siteUrl}/app?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    })

    return json({ url: session.url })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
