import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

/**
 * Delete an account, for real.
 *
 * The landing page says "delete means delete" and contrasts songdrafts with
 * iCloud on exactly that point. Until this existed there was no way for anyone
 * to delete their account at all, which made that claim false and also left us
 * short of what data protection law requires.
 *
 * Three things have to happen and only the first is automatic:
 *
 *   1. Rows. Every table cascades from auth.users, so removing the auth user
 *      takes the board, songs, versions, comments and shares with it.
 *   2. Storage. Objects in the audio bucket do NOT cascade. They have to be
 *      listed and removed explicitly, or the account disappears and the audio
 *      quietly stays on the bill forever.
 *   3. The device. Handled client side after this returns.
 *
 * Deleting an auth user needs the service role, which can never be exposed to
 * a browser, so this runs here rather than in the app. The caller's own JWT is
 * verified first: a service-role endpoint that deletes whoever it is told to
 * would be the worst bug in the codebase.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** The assurance level in a Supabase JWT ('aal1' or 'aal2'). */
function jwtAal(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
    return typeof payload.aal === 'string' ? payload.aal : null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Who is asking? Never trust an id in the body.
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(url, serviceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Sign in required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fail = (status: number, error: string) =>
      new Response(JSON.stringify({ error }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    // Two-step login on? Then this needs the second step too, the same test
    // as mfa_satisfied() in the database. The service role skips that rule,
    // so a stolen password-only session could otherwise delete everything.
    const hasFactor = (user.factors ?? []).some((f) => f.status === 'verified')
    if (hasFactor && jwtAal(jwt) !== 'aal2') {
      return fail(403, 'Confirm your two-step code first, then try again.')
    }

    /**
     * 1. Stop the billing, before anything is deleted.
     *
     * Deleting the account while a subscription runs would leave someone
     * charged every year for an account that no longer exists, with no way to
     * sign in and cancel it. So a live subscription is cancelled immediately,
     * and if Stripe refuses, nothing else happens: the account stays, and the
     * person is told to try again rather than being deleted and still billed.
     * Skipped cleanly while Stripe is not configured.
     */
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .maybeSingle()
    const billable = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused']
    if (sub?.stripe_subscription_id && billable.includes(sub.status ?? '')) {
      if (!stripeKey) {
        return fail(503, 'Your subscription could not be cancelled right now, so nothing was deleted. Try again shortly.')
      }
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      } catch {
        return fail(502, 'Your subscription could not be cancelled, so nothing was deleted. Try again, or contact support@songdrafts.com.')
      }
    }

    /**
     * 2. Storage, before the user.
     *
     * If the auth user went first and the storage sweep then failed, the audio
     * would be orphaned with no owner left to trace it back to. In this order
     * a failure leaves the account intact and retryable.
     *
     * Paths are `${userId}/${boardId}/${songId}/${versionId}.${ext}`, so
     * everything for one person sits under a single prefix.
     *
     * Two things the first version got wrong, both of which ended with the
     * account deleted and audio left behind, billed and unreachable:
     *   - a failed list() was treated as an empty folder, so an error listing
     *     the prefix deleted the account and skipped every file;
     *   - list() returns at most `limit` entries, and it was never paged, so
     *     a board with more than 1,000 songs lost the rest.
     * Listing now throws on error and pages until a short page comes back.
     */
    const PAGE = 1000
    const found: string[] = []
    const walk = async (prefix: string): Promise<void> => {
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await admin.storage
          .from('audio')
          .list(prefix, { limit: PAGE, offset })
        if (error) throw new Error(`list ${prefix}: ${error.message}`)
        for (const entry of data ?? []) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name
          // A folder has no id in the storage listing; a file does.
          if (entry.id) found.push(path)
          else await walk(path)
        }
        if (!data || data.length < PAGE) return
      }
    }
    try {
      await walk(user.id)
    } catch {
      return fail(500, 'Could not read your audio to remove it, so nothing was deleted. Try again.')
    }

    let removedCount = 0
    for (let i = 0; i < found.length; i += 100) {
      const { error } = await admin.storage.from('audio').remove(found.slice(i, i + 100))
      if (error) {
        /* Say what is true. The first version said "Nothing was deleted"
           here even when earlier batches had already gone. */
        return fail(
          500,
          removedCount === 0
            ? 'Could not remove your audio, so nothing was deleted. Try again.'
            : `${removedCount} of ${found.length} audio files were removed, but not all of them, so your account was not deleted. Try again to finish.`,
        )
      }
      removedCount += Math.min(100, found.length - i)
    }

    /**
     * 3. The email log. It is the one table set to SET NULL rather than
     * cascade, so without this the person's email address would outlive the
     * account that was deleted, against "delete means delete".
     */
    await admin.from('email_log').delete().eq('user_id', user.id)
    if (user.email) await admin.from('email_log').delete().eq('email', user.email)

    // 4. The user. Every other table cascades from auth.users (checked on production).
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      return new Response(
        JSON.stringify({ error: 'Your audio was removed but the account could not be deleted. Contact support@songdrafts.com.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ ok: true, filesRemoved: removedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
