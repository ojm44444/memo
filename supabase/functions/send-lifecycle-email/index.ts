import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  audioDeletedEmail,
  audioExpiring60Email,
  audioExpiring85Email,
  cancelledEmail,
  paymentFailedEmail,
  stalledImportEmail,
  toHtml,
  trialEndingEmail,
  welcomeEmail,
  type EmailTemplate,
} from '../_shared/emails.ts'

/**
 * Sends one lifecycle email, via Resend.
 *
 * NOT callable by the browser. It takes a shared secret in a header rather
 * than a user JWT, because everything that calls it is server side: the auth
 * hook on signup, the Stripe webhook on a failed payment, and a scheduled job
 * for the day 3 and day 5 messages. An endpoint that sends mail to an address
 * of the caller's choosing is a spam relay, and this is the whole guard
 * against becoming one.
 *
 * Idempotent through `email_log`. Stripe retries, cron overlaps, and a webhook
 * can arrive twice; none of those should put the same message in someone's
 * inbox twice. The unique index does the work, and a duplicate is a quiet
 * success rather than an error, so a retry never fails on its own past
 * success.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Kind =
  | 'welcome'
  | 'stalled_import'
  | 'trial_ending'
  | 'payment_failed'
  | 'cancelled'
  | 'audio_expiring_60'
  | 'audio_expiring_85'
  | 'audio_deleted'

serve(async (req) => {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM') ?? 'songdrafts <owen@songdrafts.com>'
  const secret = Deno.env.get('LIFECYCLE_EMAIL_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!resendKey || !secret || !url || !serviceKey) {
    return json({ error: 'Email is not configured' }, 503)
  }

  if (req.headers.get('x-lifecycle-secret') !== secret) {
    return json({ error: 'Forbidden' }, 403)
  }

  const body = await req.json().catch(() => null)
  const kind = body?.kind as Kind | undefined
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'there'
  const endsOn = typeof body?.endsOn === 'string' ? body.endsOn : ''
  const userId = typeof body?.userId === 'string' ? body.userId : null
  /* Which occurrence this message is about. Null for the five original kinds,
     which are once per address forever. The retention warnings carry the lapse
     date, because someone can lapse, resubscribe and lapse again, and the
     second countdown has to be able to warn them too. */
  const dedupeKey = typeof body?.dedupeKey === 'string' && body.dedupeKey ? body.dedupeKey : null
  const deleteOn = typeof body?.deleteOn === 'string' ? body.deleteOn : ''

  if (!kind || !email) return json({ error: 'kind and email are required' }, 400)

  let template: EmailTemplate
  switch (kind) {
    case 'welcome':
      template = welcomeEmail(name)
      break
    case 'stalled_import':
      template = stalledImportEmail(name)
      break
    case 'trial_ending':
      if (!endsOn) return json({ error: 'endsOn is required' }, 400)
      template = trialEndingEmail(name, endsOn)
      break
    case 'payment_failed':
      template = paymentFailedEmail(name)
      break
    case 'cancelled':
      if (!endsOn) return json({ error: 'endsOn is required' }, 400)
      template = cancelledEmail(name, endsOn)
      break
    case 'audio_expiring_60':
      if (!deleteOn) return json({ error: 'deleteOn is required' }, 400)
      template = audioExpiring60Email(name, deleteOn)
      break
    case 'audio_expiring_85':
      if (!deleteOn) return json({ error: 'deleteOn is required' }, 400)
      template = audioExpiring85Email(name, deleteOn)
      break
    case 'audio_deleted':
      template = audioDeletedEmail(name)
      break
    default:
      return json({ error: 'Unknown kind' }, 400)
  }

  const admin = createClient(url, serviceKey)

  /* Claim the send BEFORE calling Resend. Writing the log afterwards would
     leave a window where a retry sends a second copy, and a duplicate inbox
     message is the failure people actually notice. A send that then fails is
     recovered by deleting the row, below. */
  const { error: claimError } = await admin
    .from('email_log')
    .insert({ user_id: userId, email, kind, dedupe_key: dedupeKey })

  if (claimError) {
    // 23505 is the unique violation: already sent. That is a success.
    if ((claimError as { code?: string }).code === '23505') {
      return json({ skipped: 'already sent' })
    }
    return json({ error: claimError.message }, 500)
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: template.subject,
      text: template.text,
      html: toHtml(template.text),
    }),
  })

  if (!res.ok) {
    /* Release the claim so a retry can actually retry. Matched on the same
       three columns the unique index uses, or a failed retention warning would
       release some other lapse's row and let that one send twice. */
    let release = admin.from('email_log').delete().eq('email', email).eq('kind', kind)
    release = dedupeKey === null
      ? release.is('dedupe_key', null)
      : release.eq('dedupe_key', dedupeKey)
    await release
    return json({ error: `Resend refused it: ${await res.text()}` }, 502)
  }

  return json({ sent: true })
})
