/**
 * Where a new account came from (Owen, 18 Sept: posting on Reddit and wanting
 * to know who arrives from there).
 *
 * First touch only. The first time someone lands on the site we keep the
 * campaign tags, a `ref`, the referring host and the page, in this browser.
 * When an account is created, that record is copied once onto the user
 * (user_metadata.first_touch), where the admin side can read it.
 *
 * Tiny and quiet on purpose: every step is wrapped, nothing here can block
 * sign-in or the page, and nothing is sent anywhere except the user's own
 * Supabase record, and only after they have made an account.
 *
 * Link format for a post:
 *   https://www.songdrafts.com/?utm_source=reddit&utm_medium=post&utm_campaign=<thread>
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'

type AuthOnly = Pick<SupabaseClient, 'auth'>

const KEY = 'sd_first_touch'
const SAVED_KEY = 'sd_first_touch_saved'
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'] as const

/** Only accounts this new get tagged, so an old account signing in on a new
 *  device after clicking a Reddit link is not counted as a Reddit sign-up. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000

export type FirstTouch = Partial<Record<(typeof PARAMS)[number], string>> & {
  referrer?: string
  path: string
  at: string
}

function read(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FirstTouch) : null
  } catch {
    return null
  }
}

/** Record the first visit. Never overwrites an existing first touch. */
export function captureFirstTouch() {
  try {
    if (localStorage.getItem(KEY)) return
    const q = new URLSearchParams(window.location.search)
    const touch: FirstTouch = { path: window.location.pathname, at: new Date().toISOString() }
    for (const p of PARAMS) {
      const v = q.get(p)
      if (v) touch[p] = v.slice(0, 120)
    }
    if (document.referrer) {
      const host = new URL(document.referrer).host
      if (host && host !== window.location.host) touch.referrer = host
    }
    localStorage.setItem(KEY, JSON.stringify(touch))
  } catch {
    /* storage blocked or a malformed referrer: no attribution, nothing else */
  }
}

let inFlight = false

async function saveOnce(client: AuthOnly, user: User) {
  try {
    if (inFlight || localStorage.getItem(SAVED_KEY) === user.id) return
    if (user.user_metadata?.first_touch) {
      localStorage.setItem(SAVED_KEY, user.id)
      return
    }
    const created = Date.parse(user.created_at)
    if (!Number.isFinite(created) || Date.now() - created > NEW_ACCOUNT_MS) return
    const touch = read()
    if (!touch) return
    inFlight = true
    const { error } = await client.auth.updateUser({ data: { first_touch: touch } })
    if (!error) localStorage.setItem(SAVED_KEY, user.id)
  } catch {
    /* never in the way of signing in */
  } finally {
    inFlight = false
  }
}

/**
 * Watch for a session and save the first touch onto a new account. Deferred
 * out of the auth callback, because awaiting an auth call inside
 * onAuthStateChange can stall supabase-js.
 */
export function watchForNewAccount(client: AuthOnly) {
  try {
    client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) window.setTimeout(() => void saveOnce(client, user), 0)
    })
  } catch {
    /* ignore */
  }
}
