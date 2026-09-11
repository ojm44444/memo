import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Email a bandmate their invite.
 *
 * WHY THIS TAKES ONLY A TOKEN. The first version took `to`, `link` and
 * `boardName` from the request body and put them into the email as sent. Any
 * signed-in account could therefore make songdrafts send any address any link
 * with any text, from our own verified domain, and the name and board went in
 * as raw HTML. That is an open relay for phishing, and the first person to
 * find it would have burned the domain's sending reputation and got the
 * Resend account closed. It was only harmless because RESEND_API_KEY was not
 * set yet.
 *
 * Now the caller sends the invite token and nothing else. The function checks
 * the invite exists, is live, and was created by the caller; the recipient is
 * the address stored on the invite; the link is built here from the token; and
 * every piece of text that reaches the HTML is escaped. A daily cap per
 * account stops even a legitimate one being used as a spam cannon.
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

/** Invites one account may email in 24 hours. A band is not forty people. */
const DAILY_LIMIT = 20

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // Not a person's name, same rule as the lifecycle emails.
    const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'songdrafts <hello@songdrafts.com>'
    const replyTo = Deno.env.get('EMAIL_REPLY_TO') ?? 'support@songdrafts.com'
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://www.songdrafts.com').replace(/\/$/, '')

    if (!resendKey || !url || !serviceKey) {
      return json({ error: 'Invite email is not configured' }, 503)
    }

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(url, serviceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const body = (await req.json().catch(() => null)) as { token?: unknown } | null
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) return json({ error: 'Missing invite' }, 400)

    const { data: invite } = await admin
      .from('board_invites')
      .select('board_id, created_by, invitee_email, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!invite || invite.created_by !== user.id) return json({ error: 'Invite not found' }, 404)
    if (invite.revoked_at) return json({ error: 'That invite was revoked' }, 410)
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return json({ error: 'That invite has expired' }, 410)
    }
    const recipient = invite.invitee_email?.trim().toLowerCase()
    if (!recipient) return json({ error: 'This invite has no email address to send to' }, 400)

    const since = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count } = await admin
      .from('board_invites')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .gte('created_at', since)
    if ((count ?? 0) > DAILY_LIMIT) {
      return json({ error: 'That is a lot of invites for one day. Try again tomorrow.' }, 429)
    }

    // What the invite page itself will call it, so the email and the page agree.
    const [{ data: board }, { data: profile }] = await Promise.all([
      admin.from('boards').select('name').eq('id', invite.board_id).maybeSingle(),
      admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    ])
    const boardName = (board?.name ?? 'a songdrafts board').slice(0, 80)
    const rawName = profile?.display_name ?? ''
    const inviter = (rawName && !rawName.includes('@') ? rawName : 'A bandmate').slice(0, 60)

    const link = `${siteUrl}/invite/${encodeURIComponent(token)}`
    const html = `
      <p>${escapeHtml(inviter)} invited you to ${escapeHtml(boardName)} on songdrafts.</p>
      <p><a href="${escapeHtml(link)}">Open the invite</a></p>
      <p style="color:#666;font-size:13px;">songdrafts is a board for voice memos and demos. Open the link on the device you want to use it on.</p>
    `
    const text = `${inviter} invited you to ${boardName} on songdrafts.\n\nOpen the invite: ${link}\n\nOpen the link on the device you want to use it on.`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        reply_to: replyTo,
        to: [recipient],
        subject: `${inviter} invited you to ${boardName} on songdrafts`.slice(0, 150),
        html,
        text,
      }),
    })
    if (!res.ok) return json({ error: 'The email could not be sent. Copy the link instead.' }, 502)

    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
