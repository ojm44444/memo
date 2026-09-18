import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno'

/**
 * Billing actions for a signed-in person: start a checkout, open the portal,
 * take the refund, or read back what a finished checkout charged.
 *
 * PRICES (15 Sept 2026): $79 a year, $12 a month. No trial, no $1 week: the
 * full price is charged at checkout. Looked up by Stripe lookup key, never
 * taken from the request, so a price change is a repoint in Stripe rather
 * than a redeploy, and a client cannot name a cheaper price.
 *
 * The $49 founding price (songdrafts_founding_49) exists in Stripe and in
 * this code but is OFF: settled after a Hormozi pass on 15 Sept, discounting
 * an unproven product teaches people to wait. It only turns on with the env
 * var FOUNDING_OFFER=on, and even then only through the 100-place cap in 035.
 *
 * MANAGED PAYMENTS. Owen chose Stripe as merchant of record so Stripe carries
 * the global VAT/sales tax. That only applies to a Checkout Session created
 * with managed_payments.enabled on API 2025-03-31.basil or later, which is why
 * this is on stripe-node 18 (basil). The product needs an eligible tax code.
 * STRIPE_MANAGED_PAYMENTS=off disables it, for a sandbox without it.
 *
 * REFUNDS: the 30-day money-back guarantee (Owen, 18 Sept), on both plans:
 * everything paid in the first 30 days, in full, no questions, no pro-rata.
 * One button in Settings. The subscription is cancelled at the same moment,
 * so nothing renews.
 *
 * CURRENCY: dollars by default; pounds when the visitor chose them and the
 * Stripe price carries a GBP currency option. Without that option the
 * session stays in dollars rather than failing.
 *
 * PROMO CODES: typed in at checkout, or pre-applied from a partner link
 * (?promo=CODE on the site, passed through as body.promo).
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

type Plan = 'founding' | 'year' | 'month'

const LIVE_STATUSES = ['trialing', 'active', 'past_due']

/** Said on the Stripe page itself, above the pay button. */
const FOUNDING_TERMS =
  '$49 a year for as long as your subscription stays active. If you cancel, you rejoin at the current price. Full refund within 30 days.'
/* 18 Sept, Owen: the guarantee is advertised everywhere, including here. */
const YEAR_TERMS = '30 days, fully refunded if it is not for you. No questions.'
const MONTH_TERMS = '30 days, fully refunded if it is not for you. No questions.'

const REFUND_DAYS = { year: 30, month: 30 } as const

const clip = (value: string | null | undefined, max = 480) => (value ?? '').slice(0, max)

/** Stripe lookup keys, so the dashboard decides the amount. */
const LOOKUP_KEYS: Record<Plan, string> = {
  founding: 'songdrafts_founding_49',
  year: 'songdrafts_annual_79',
  month: 'songdrafts_monthly_12',
}

async function priceFor(stripe: Stripe, plan: Plan): Promise<{ id: string; currencies: string[] } | null> {
  const found = await stripe.prices.list({
    lookup_keys: [LOOKUP_KEYS[plan]],
    active: true,
    limit: 1,
    expand: ['data.currency_options'],
  })
  const price = found.data[0]
  if (!price) return null
  return { id: price.id, currencies: Object.keys(price.currency_options ?? { [price.currency]: {} }) }
}

/** An active promotion code's id, from the code a partner link carried. */
async function promotionCodeId(stripe: Stripe, raw: unknown): Promise<string | null> {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40) : ''
  if (!code) return null
  const found = await stripe.promotionCodes.list({ code, active: true, limit: 1 })
  return found.data[0]?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://www.songdrafts.com').replace(/\/$/, '')
    const foundingOn = Deno.env.get('FOUNDING_OFFER') === 'on'
    const managedPayments = Deno.env.get('STRIPE_MANAGED_PAYMENTS') !== 'off'

    if (!stripeKey || !url || !serviceKey) {
      return json({ error: 'Billing is not switched on yet. Nothing was charged.' }, 503)
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Sign in required' }, 401)

    const admin = createClient(url, serviceKey)
    const { data: userData } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (!user?.email) return json({ error: 'Sign in required' }, 401)

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const mode = ['portal', 'refund', 'receipt'].includes(String(body.mode)) ? String(body.mode) : 'checkout'

    const { data: row } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status, current_period_end, plan, first_paid_at, refunded_at')
      .eq('user_id', user.id)
      .maybeSingle()

    const isLive =
      !!row &&
      LIVE_STATUSES.includes(row.status) &&
      (!row.current_period_end || new Date(row.current_period_end).getTime() > Date.now())

    // ── What did that checkout charge? For the browser's Purchase event. ──
    if (mode === 'receipt') {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      if (!sessionId.startsWith('cs_')) return json({ error: 'Missing session' }, 400)
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.client_reference_id !== user.id) return json({ error: 'Not your checkout' }, 403)
      if (session.payment_status !== 'paid') return json({ paid: false })
      return json({
        paid: true,
        eventId: session.id,
        value: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? 'usd').toUpperCase(),
        plan: session.metadata?.plan ?? null,
      })
    }

    // ── One Stripe customer per person ──────────────────────────────────
    // The idempotency key makes two checkouts started at once share one
    // customer instead of racing to create two (Stripe keeps keys 24 hours;
    // after that the stored id below is what prevents a second).
    let customerId = row?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { supabase_user_id: user.id } },
        { idempotencyKey: `customer-${user.id}` },
      )
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

    // ── The refund button ───────────────────────────────────────────────
    if (mode === 'refund') {
      if (!row?.stripe_subscription_id) return json({ error: 'There is no payment to refund.' }, 409)
      if (row.refunded_at) return json({ error: 'This subscription has already been refunded.' }, 409)

      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      const interval = sub.items.data[0]?.price?.recurring?.interval === 'month' ? 'month' : 'year'
      const paid = await stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 10 })
      const first = paid.data[paid.data.length - 1]

      if (!first) return json({ error: 'There is no payment to refund.' }, 409)

      const paidAt = (first.status_transitions?.paid_at ?? first.created) * 1000
      const days = (Date.now() - paidAt) / 86_400_000
      if (days > REFUND_DAYS[interval]) {
        return json({ error: `The ${REFUND_DAYS[interval]} day refund window has closed. Cancel in Manage billing to stop renewal.` }, 409)
      }

      /* Everything paid inside the window comes back: a monthly plan can
         renew once inside 30 days, and the guarantee is "full refund". */
      let refunded = 0
      let refundCurrency = first.currency ?? 'usd'
      for (const invoice of paid.data) {
        // Basil: an invoice no longer points at its payment. The Invoice
        // Payments list does.
        const payments = await stripe.invoicePayments.list({ invoice: invoice.id!, limit: 5 })
        const pi = payments.data.find((p: Stripe.InvoicePayment) => p.payment?.type === 'payment_intent')?.payment?.payment_intent
        const paymentIntent = typeof pi === 'string' ? pi : pi?.id
        if (!paymentIntent) continue
        // Refund first: if the cancel then fails, they have their money and
        // can cancel from the portal. The other way round could cancel them
        // and leave the refund unissued.
        const refund = await stripe.refunds.create(
          { payment_intent: paymentIntent, metadata: { supabase_user_id: user.id, reason: 'refund_button' } },
          { idempotencyKey: `refund-${invoice.id}` },
        )
        refunded += refund.amount
        refundCurrency = refund.currency
      }
      if (refunded === 0) return json({ error: 'Could not find that payment. Email songdraftsapp@gmail.com.' }, 500)
      await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false })

      const now = new Date().toISOString()
      await admin
        .from('subscriptions')
        .update({ refunded_at: now, status: 'canceled', cancel_at_period_end: false, updated_at: now })
        .eq('user_id', user.id)
      await admin
        .from('founding_places')
        .update({ status: 'released', released_at: now, release_reason: 'refunded' })
        .eq('stripe_subscription_id', sub.id)
        .neq('status', 'released')

      return json({
        refunded: true,
        amount: refunded / 100,
        currency: refundCurrency.toUpperCase(),
      })
    }

    // ── Checkout ────────────────────────────────────────────────────────
    // Never a second subscription on top of a live one. That used to be
    // possible by pressing the button twice, and each one would have billed.
    if (isLive) return json({ error: 'already_subscribed' }, 409)

    const plan: Plan = body.plan === 'founding' || body.plan === 'month' ? body.plan : 'year'
    if (plan === 'founding' && !foundingOn) return json({ error: 'founding_off' }, 409)

    const price = await priceFor(stripe, plan)
    if (!price) return json({ error: 'Billing is not switched on yet. Nothing was charged.' }, 503)
    const wantCurrency = body.currency === 'gbp' || body.currency === 'usd' ? body.currency : null
    const currency = wantCurrency && price.currencies.includes(wantCurrency) ? wantCurrency : null
    const promotionCode = await promotionCodeId(stripe, body.promo)

    let foundingPlaceId: string | null = null
    if (plan === 'founding') {
      const { data: placeId, error: claimError } = await admin.rpc('claim_founding_place', {
        p_user_id: user.id,
        p_hold_minutes: 40,
      })
      if (claimError) {
        if (claimError.message.includes('founding_not_eligible')) {
          return json({ error: 'founding_not_eligible' }, 409)
        }
        throw claimError
      }
      if (!placeId) return json({ error: 'founding_full' }, 409)
      foundingPlaceId = placeId as string
    }

    /* Consent as it stands at the moment of paying, so the webhook can send
       the server copy of the Purchase only for someone who allowed it. The
       browser ids let Meta match the two copies of the same event. */
    const adConsent = body.adConsent === true
    const forwarded = req.headers.get('x-forwarded-for') ?? ''
    const metadata: Record<string, string> = {
      supabase_user_id: user.id,
      plan,
      ...(foundingPlaceId ? { founding_place_id: foundingPlaceId } : {}),
      ad_consent: adConsent ? '1' : '0',
      ...(adConsent
        ? {
            fbp: clip(typeof body.fbp === 'string' ? body.fbp : ''),
            fbc: clip(typeof body.fbc === 'string' ? body.fbc : ''),
            client_ip: clip(forwarded.split(',')[0]?.trim()),
            client_ua: clip(req.headers.get('user-agent')),
          }
        : {}),
    }

    // Stripe's shortest session. The founding hold outlives it by ten
    // minutes, so a place is never released under someone still paying.
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      ...(currency ? { currency } : {}),
      subscription_data: { metadata },
      metadata,
      client_reference_id: user.id,
      // A partner link's code is applied for them; otherwise a code box.
      ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
      expires_at: expiresAt,
      custom_text: {
        submit: { message: plan === 'founding' ? FOUNDING_TERMS : plan === 'year' ? YEAR_TERMS : MONTH_TERMS },
      },
      success_url: `${siteUrl}/app?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app?checkout=cancelled`,
      ...(managedPayments ? { managed_payments: { enabled: true } } : {}),
    } as Stripe.Checkout.SessionCreateParams)

    if (foundingPlaceId) {
      const { data: held } = await admin
        .from('founding_places')
        .select('stripe_checkout_session_id')
        .eq('id', foundingPlaceId)
        .maybeSingle()

      await admin
        .from('founding_places')
        .update({
          stripe_checkout_session_id: session.id,
          held_until: new Date((expiresAt + 10 * 60) * 1000).toISOString(),
        })
        .eq('id', foundingPlaceId)

      // Pressing the button again keeps the same place. Close the checkout it
      // was held for, so two open pages cannot both be paid. Done after the
      // place points at the new session, so that page's "expired" webhook
      // cannot release the place this one is using.
      const previous = held?.stripe_checkout_session_id
      if (previous && previous !== session.id) {
        await stripe.checkout.sessions.expire(previous).catch(() => undefined)
      }
    }

    return json({ url: session.url })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
