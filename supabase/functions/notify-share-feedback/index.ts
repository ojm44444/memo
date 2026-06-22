import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Triggered by a Supabase database webhook on INSERT to share_listen_comments.
// Looks up the song owner's email and sends them a notification via Resend.

serve(async (req) => {
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromAddress = Deno.env.get('INVITE_FROM_EMAIL') ?? 'memo <onboarding@resend.dev>'
    const appUrl = Deno.env.get('APP_URL') ?? 'https://memo.owenmellett.com'

    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Resend not configured' }), { status: 503 })
    }

    // Supabase webhook sends the record in { type, table, record, old_record }
    const payload = await req.json()
    const comment = payload.record

    if (!comment?.id) {
      return new Response(JSON.stringify({ error: 'No record' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get the share token to find the song and owner
    const { data: share } = await supabase
      .from('song_shares')
      .select('song_id, token')
      .eq('token', comment.share_token)
      .single()

    if (!share?.song_id) {
      return new Response(JSON.stringify({ error: 'Share not found' }), { status: 404 })
    }

    // Get the song
    const { data: song } = await supabase
      .from('songs')
      .select('title, project_id')
      .eq('id', share.song_id)
      .single()

    // Get the board owner via board_members
    const { data: members } = await supabase
      .from('board_members')
      .select('user_id, role')
      .eq('role', 'owner')
      .limit(1)

    const ownerId = members?.[0]?.user_id
    if (!ownerId) {
      return new Response(JSON.stringify({ error: 'Owner not found' }), { status: 404 })
    }

    // Get owner's email from auth.users via admin API
    const { data: ownerData } = await supabase.auth.admin.getUserById(ownerId)
    const ownerEmail = ownerData?.user?.email
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: 'Owner email not found' }), { status: 404 })
    }

    const songTitle = song?.title || 'Untitled'
    const author = comment.author_name || 'Someone'
    const body = comment.body || ''
    const timestampSec = Math.floor((comment.timestamp_ms ?? 0) / 1000)
    const mins = Math.floor(timestampSec / 60)
    const secs = String(timestampSec % 60).padStart(2, '0')
    const timestampLabel = `${mins}:${secs}`
    const shareUrl = `${appUrl}/share/${share.token}`

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <p style="font-size:16px;margin-bottom:8px">
          <strong>${author}</strong> left feedback on <strong>${songTitle}</strong>
        </p>
        <div style="background:#f4f4f5;border-left:3px solid #6dffb8;padding:12px 16px;border-radius:4px;margin:16px 0">
          <p style="margin:0 0 6px;font-size:12px;color:#666">at ${timestampLabel}</p>
          <p style="margin:0;font-size:15px">${body}</p>
        </div>
        <a href="${shareUrl}" style="display:inline-block;background:#6dffb8;color:#0a0c10;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Listen &amp; reply
        </a>
        <p style="margin-top:24px;font-size:12px;color:#999">
          You received this because someone left feedback on your memo share link.
        </p>
      </div>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [ownerEmail],
        subject: `New feedback on "${songTitle}"`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const detail = await resendRes.text()
      return new Response(JSON.stringify({ error: detail }), { status: 502 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }),
      { status: 500 },
    )
  }
})
