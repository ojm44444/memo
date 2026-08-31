import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    /**
     * Storage first, deliberately.
     *
     * If the auth user goes first and the storage sweep then fails, the audio
     * is orphaned with no owner left to trace it back to. Doing it in this
     * order means a failure leaves the account intact and retryable, which is
     * the recoverable direction.
     *
     * Paths are `${userId}/${boardId}/${songId}/${versionId}.${ext}`, so
     * everything for one person sits under a single prefix.
     */
    const removed: string[] = []
    const walk = async (prefix: string) => {
      const { data, error } = await admin.storage.from('audio').list(prefix, { limit: 1000 })
      if (error || !data) return
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        // A folder has no id in the storage listing; a file does.
        if (entry.id) removed.push(path)
        else await walk(path)
      }
    }
    await walk(user.id)

    if (removed.length) {
      // Storage remove has a per-call ceiling, so this goes in batches.
      for (let i = 0; i < removed.length; i += 100) {
        const { error } = await admin.storage.from('audio').remove(removed.slice(i, i + 100))
        if (error) {
          return new Response(
            JSON.stringify({ error: 'Could not remove your audio. Nothing was deleted.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    // Now the user, which cascades every table.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      return new Response(
        JSON.stringify({ error: 'Your audio was removed but the account could not be deleted. Contact support@songdrafts.com.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ ok: true, filesRemoved: removed.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
