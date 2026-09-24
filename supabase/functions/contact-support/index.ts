import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * The "Ask us" form on the landing page. Emails the support inbox and keeps a
 * copy in support_messages.
 *
 * Anyone can call it, so the guards are: the recipient is fixed (this is not a
 * relay to anyone else), every string is escaped, the sender's address only
 * ever goes in reply_to, and it is rate limited per address and overall.
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

const SUPPORT_INBOX = Deno.env.get('SUPPORT_INBOX') ?? 'songdraftsapp@gmail.com'
const PER_ADDRESS_PER_HOUR = 3
const OVERALL_PER_HOUR = 40

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => null)) as {
    email?: unknown
    message?: unknown
    website?: unknown
  } | null

  // A field real people never see. Bots fill it; they get a fake success.
  if (typeof body?.website === 'string' && body.website.trim()) return json({ ok: true })

  const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 254) : ''
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 4000) : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email so we can reply.' }, 400)
  if (message.length < 2) return json({ error: 'Write us a message.' }, 400)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const from = Deno.env.get('EMAIL_FROM') ?? 'songdrafts <hello@songdrafts.com>'
  if (!url || !serviceKey) return json({ error: 'Not configured' }, 503)

  const admin = createClient(url, serviceKey)
  const since = new Date(Date.now() - 3_600_000).toISOString()

  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from('support_messages').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since),
    admin.from('support_messages').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  if ((mine ?? 0) >= PER_ADDRESS_PER_HOUR || (all ?? 0) >= OVERALL_PER_HOUR) {
    return json({ error: 'Lots of messages just now. Email us directly and we will reply.' }, 429)
  }

  const { data: row, error } = await admin
    .from('support_messages')
    .insert({ email, message })
    .select('id')
    .single()
  if (error) return json({ error: 'Could not save that. Email us directly instead.' }, 500)

  if (!resendKey) return json({ ok: true, emailed: false })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [SUPPORT_INBOX],
      reply_to: email,
      subject: `songdrafts help from ${email}`,
      text: `From: ${email}\n\n${message}`,
      html: `<p><strong>From:</strong> ${escapeHtml(email)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    }),
  })
  if (res.ok) await admin.from('support_messages').update({ emailed: true }).eq('id', row.id)
  return json({ ok: true, emailed: res.ok })
})
