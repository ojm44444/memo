import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Tell a song's owner that a listener left a comment on their share link.
 *
 * REWRITTEN 14 Sept. The version live since June had three problems, and it
 * was only harmless because RESEND_API_KEY was not set yet:
 *
 *  1. It was an unauthenticated relay into the owner's inbox. The comment
 *     (author, body, timestamp) came from the request body, and the share page
 *     built it with a random id, so anyone could POST any text, unescaped HTML
 *     included, and songdrafts would email it to the owner from our own
 *     domain. Phishing aimed at our customers, signed by us.
 *  2. It emailed the wrong person. "The owner" was the first row in
 *     board_members with role 'owner', across ALL boards. No owner has such a
 *     row (board_members holds invited bandmates; ownership is boards.user_id),
 *     so it always failed with "Owner not found" and no notification has ever
 *     sent. Had one existed, every user's listener comments would have gone to
 *     that one address.
 *  3. It still said memo, sent from Resend's sandbox, linked to an old domain.
 *
 * Now the caller sends a share token and nothing else. Everything in the email
 * is read from the database: the newest comment on that share, only if it is
 * minutes old; the owner from boards.user_id for the share's board. Each
 * comment is claimed in email_log before sending, so it notifies exactly once
 * however often this is called, and one share can raise at most HOURLY_CAP
 * emails an hour, so a flood of comments cannot become a flood of mail.
 *
 * Listeners are anonymous, so there is no JWT to check. The guard is that a
 * caller can only ever cause an email about a real, fresh, unnotified comment,
 * sent to that song's real owner, with every string escaped.
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

/** A comment older than this is not "just posted", so it does not notify. */
const FRESH_MINUTES = 10
/** Most notification emails one share link can raise in an hour. */
const HOURLY_CAP = 10

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const from = Deno.env.get('EMAIL_FROM') ?? 'songdrafts <hello@songdrafts.com>'
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://www.songdrafts.com').replace(/\/$/, '')
    if (!resendKey || !url || !serviceKey) return json({ error: 'Email is not configured' }, 503)

    const body = (await req.json().catch(() => null)) as { token?: unknown } | null
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) return json({ error: 'Missing share' }, 400)

    const admin = createClient(url, serviceKey)

    const { data: share } = await admin
      .from('song_shares')
      .select('id, song_id, board_id, token, revoked_at')
      .eq('token', token)
      .maybeSingle()
    if (!share || share.revoked_at) return json({ skipped: 'no live share' })

    const since = new Date(Date.now() - FRESH_MINUTES * 60_000).toISOString()
    const { data: comment } = await admin
      .from('share_listen_comments')
      .select('id, body, author_name, timestamp_ms, created_at')
      .eq('share_id', share.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!comment) return json({ skipped: 'no fresh comment' })

    const { data: board } = await admin
      .from('boards')
      .select('user_id')
      .eq('id', share.board_id)
      .maybeSingle()
    if (!board?.user_id) return json({ skipped: 'no owner' })

    const { data: ownerData } = await admin.auth.admin.getUserById(board.user_id)
    const ownerEmail = ownerData?.user?.email
    if (!ownerEmail) return json({ skipped: 'owner has no email' })

    // Per-share hourly cap, counted from the claims below.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'share_feedback')
      .like('dedupe_key', `${share.id}:%`)
      .gte('sent_at', hourAgo)
    if ((count ?? 0) >= HOURLY_CAP) return json({ skipped: 'hourly cap reached' })

    // Claim before sending: one email per comment, however often we are called.
    const dedupeKey = `${share.id}:${comment.id}`
    const { error: claimError } = await admin
      .from('email_log')
      .insert({ user_id: board.user_id, email: ownerEmail, kind: 'share_feedback', dedupe_key: dedupeKey })
    if (claimError) {
      if ((claimError as { code?: string }).code === '23505') return json({ skipped: 'already notified' })
      return json({ error: claimError.message }, 500)
    }

    const { data: song } = await admin.from('songs').select('title').eq('id', share.song_id).maybeSingle()
    const songTitle = (song?.title || 'Untitled').slice(0, 120)
    const author = (comment.author_name || 'A listener').slice(0, 60)
    const text = (comment.body || '').slice(0, 2000)
    const total = Math.floor((comment.timestamp_ms ?? 0) / 1000)
    const at = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    const link = `${siteUrl}/share/${encodeURIComponent(share.token)}`

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;color:#1c2320;font-size:15px;line-height:1.6">
        <p style="margin:0 0 8px"><strong>${escapeHtml(author)}</strong> left a comment on <strong>${escapeHtml(songTitle)}</strong></p>
        <div style="background:#f3f6f4;border-left:3px solid #9ddbad;padding:12px 16px;border-radius:4px;margin:16px 0">
          <p style="margin:0 0 6px;font-size:12px;color:#6b7671">at ${at}</p>
          <p style="margin:0">${escapeHtml(text).replace(/\n/g, '<br>')}</p>
        </div>
        <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="color:#1c2320">Open the share page</a></p>
        <p style="margin:0;font-size:12px;color:#6b7671">You get these because someone commented on a songdrafts share link you sent.</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [ownerEmail],
        subject: `New comment on "${songTitle}"`.slice(0, 150),
        html,
        text: `${author} left a comment on ${songTitle}, at ${at}:\n\n${text}\n\n${link}`,
      }),
    })

    if (!res.ok) {
      // Release the claim so a later call can retry this comment.
      await admin.from('email_log').delete().eq('kind', 'share_feedback').eq('dedupe_key', dedupeKey)
      return json({ error: 'Email provider refused it' }, 502)
    }
    return json({ sent: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
