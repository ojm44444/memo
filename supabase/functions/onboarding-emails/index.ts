import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Once a day: send the import how-to emails (welcome, then the day 3 nudge if
 * the board is still empty). Who is due comes from onboarding_email_candidates;
 * the sending, the dedupe through email_log and the copy live in
 * send-lifecycle-email. Same shared secret header as retention-sweep.
 * ?dry=1 lists who would be emailed and sends nothing.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('LIFECYCLE_EMAIL_SECRET')
  if (!url || !serviceKey || !secret) return json({ error: 'Onboarding emails are not configured' }, 503)
  if (req.headers.get('x-lifecycle-secret') !== secret) return json({ error: 'Forbidden' }, 403)

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const admin = createClient(url, serviceKey)
  const { data, error } = await admin.rpc('onboarding_email_candidates')
  if (error) return json({ error: error.message }, 500)

  const due = (data ?? []) as { user_id: string; email: string; display_name: string; kind: string }[]
  if (dry) return json({ dry, due: due.map((d) => ({ kind: d.kind, email: d.email })) })

  const report = { due: due.length, sent: 0, errors: [] as string[] }
  for (const row of due) {
    const res = await fetch(`${url}/functions/v1/send-lifecycle-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lifecycle-secret': secret,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ kind: row.kind, email: row.email, name: row.display_name, userId: row.user_id }),
    })
    if (res.ok) report.sent++
    else report.errors.push(`${row.kind}: ${await res.text()}`)
  }
  return json(report)
})
