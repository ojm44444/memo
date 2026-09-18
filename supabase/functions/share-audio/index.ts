import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Short signed URLs for the audio on a share link (19 Sept, security review).
 *
 * Before this, the listening pages signed their own URLs: storage.objects had
 * an anon SELECT policy built on audio_object_is_shared(name). That let a
 * viewer ask for any expiry they liked (a year), so revoking a link did not
 * stop them; it ignored the link password; and "no downloads" was only a
 * label. Now nobody without an account can sign anything. They ask here, and
 * this signs for 10 minutes, only files the link itself releases.
 *
 * The checks are not re-implemented. The same SECURITY DEFINER RPCs the pages
 * already call decide: get_song_share_listen / get_collection_share (token
 * exists, not revoked, not expired, password matches, the song is on the
 * link's board). Only the storage paths those return can be signed here.
 * Called with the service role, get_collection_share does not count a view,
 * and a wrong password counts toward the link's hourly limit (049).
 *
 * Viewers are anonymous, so verify_jwt is off and every request is checked
 * here instead.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** How long a URL from here works. Revoking a link stops new ones at once. */
const URL_SECONDS = 10 * 60
/** A page asks for the track about to play and maybe the next one. */
const MAX_PATHS = 4
/** Per client address, per isolate. Best effort; the password limit is the real one. */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120

const hits = new Map<string, { start: number; count: number }>()
function limited(key: string) {
  const now = Date.now()
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k)
  }
  const entry = hits.get(key)
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(key, { start: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

type Body = {
  kind?: unknown
  token?: unknown
  password?: unknown
  paths?: unknown
  cover?: unknown
  download?: unknown
}

function friendlyError(message: string): { status: number; error: string } {
  if (/too many/i.test(message)) return { status: 429, error: message }
  if (/password/i.test(message)) return { status: 401, error: 'Password required' }
  if (/not found|expired/i.test(message)) return { status: 404, error: 'Link not found or expired' }
  return { status: 400, error: 'Could not open this link' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (limited(ip)) return json({ error: 'Too many requests. Try again in a minute.' }, 429)

  const body = (await req.json().catch(() => null)) as Body | null
  const kind = body?.kind
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const password = typeof body?.password === 'string' && body.password.trim() ? body.password.trim() : null
  const wantCover = body?.cover === true
  const download =
    typeof body?.download === 'string' && body.download.trim() ? body.download.trim().slice(0, 200) : null
  const paths = Array.isArray(body?.paths)
    ? [...new Set(body.paths.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 500))]
    : []

  if ((kind !== 'song' && kind !== 'collection') || !token || token.length > 200) {
    return json({ error: 'Missing share' }, 400)
  }
  if (paths.length > MAX_PATHS) return json({ error: `At most ${MAX_PATHS} files per request` }, 400)
  if (download && paths.length !== 1) return json({ error: 'One file per download' }, 400)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Not configured' }, 503)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin.rpc(kind === 'song' ? 'get_song_share_listen' : 'get_collection_share', {
    p_token: token,
    p_password: password,
  })
  if (error) {
    const { status, error: message } = friendlyError(error.message ?? '')
    return json({ error: message }, status)
  }
  const payload = (data ?? {}) as {
    error?: string
    storage_path?: string | null
    allow_download?: boolean
    cover_path?: string | null
    tracks?: Array<{ storage_path?: string | null }>
  }
  if (payload.error) {
    const { status, error: message } = friendlyError(payload.error)
    return json({ error: message }, status)
  }

  // What this link releases, straight from the RPC. Nothing else is signable.
  const audio = new Set<string>()
  if (kind === 'song') {
    if (payload.storage_path) audio.add(payload.storage_path)
  } else {
    for (const track of payload.tracks ?? []) if (track.storage_path) audio.add(track.storage_path)
  }
  const cover = kind === 'collection' ? payload.cover_path ?? null : null

  // A song link has one file, so asking with no paths means that one.
  const wanted = paths.length ? paths : kind === 'song' && !wantCover ? [...audio] : []
  if (wanted.some((p) => !audio.has(p))) return json({ error: 'That file is not on this link' }, 403)
  if (download && !payload.allow_download) return json({ error: 'Downloads are off for this link' }, 403)

  const bucket = admin.storage.from('audio')
  const urls: Record<string, string> = {}
  for (const path of wanted) {
    const { data: signed, error: signError } = await bucket.createSignedUrl(
      path,
      URL_SECONDS,
      download ? { download } : undefined,
    )
    if (signError || !signed?.signedUrl) return json({ error: 'Could not open that file' }, 502)
    urls[path] = signed.signedUrl
  }

  let coverUrl: string | null = null
  if (wantCover && cover) {
    const { data: signed } = await bucket.createSignedUrl(cover, URL_SECONDS)
    coverUrl = signed?.signedUrl ?? null
  }

  return json({ urls, coverUrl, expiresIn: URL_SECONDS })
})
