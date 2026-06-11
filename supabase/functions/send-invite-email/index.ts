import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InvitePayload {
  to: string
  link: string
  boardName: string
  inviterName?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromAddress = Deno.env.get('INVITE_FROM_EMAIL') ?? 'mem• <onboarding@resend.dev>'

    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Invite email is not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { to, link, boardName, inviterName } = (await req.json()) as InvitePayload
    const recipient = to?.trim().toLowerCase()
    if (!recipient || !link || !boardName) {
      return new Response(JSON.stringify({ error: 'Missing invite fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sender = inviterName?.trim() || userData.user.email?.split('@')[0] || 'Someone'
    const html = `
      <p>Hey — ${sender} invited you to collaborate on <strong>${boardName}</strong> in mem•.</p>
      <p><a href="${link}">Open invite and sign in</a></p>
      <p style="color:#666;font-size:13px;">mem• is a local-first songwriting board for voice memos, demos, and share feedback.</p>
    `

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject: `Join ${boardName} on mem•`,
        html,
      }),
    })

    if (!resendResponse.ok) {
      const detail = await resendResponse.text()
      return new Response(JSON.stringify({ error: detail || 'Email provider error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
