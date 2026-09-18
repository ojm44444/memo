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
 *   Short links live in vercel.json, see docs/short-links.md.
 *
 * Added 18 Sept: the whole referring address (not just the host), the answer
 * to "How did you hear about songdrafts?" from the Create account page, and
 * a `promo` code from the address for checkout. The answer and the first
 * touch are written once to the user's own row through record_signup_source
 * (migration 047), which fills empty fields only.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'

type AuthOnly = Pick<SupabaseClient, 'auth'> & Partial<Pick<SupabaseClient, 'rpc'>>

const KEY = 'sd_first_touch'
const SAVED_KEY = 'sd_first_touch_saved'
const HEARD_KEY = 'sd_heard_from'
const SOURCE_SAVED_KEY = 'sd_signup_source_saved'
const PROMO_KEY = 'sd_promo'
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'] as const

/** Only accounts this new get tagged, so an old account signing in on a new
 *  device after clicking a Reddit link is not counted as a Reddit sign-up. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000

export type FirstTouch = Partial<Record<(typeof PARAMS)[number], string>> & {
  /** The referring host, kept for GA4's user properties. */
  referrer?: string
  /** The whole referring address, up to 500 characters. */
  referrer_url?: string
  path: string
  at: string
}

/** The answers on the Create account page, in order. */
export const HEARD_FROM_OPTIONS = [
  { value: 'reddit', label: 'Reddit' },
  { value: 'friend', label: 'A friend' },
  { value: 'tiktok_instagram', label: 'TikTok or Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'newsletter', label: 'A newsletter' },
  { value: 'other', label: 'Other' },
] as const

export type HeardFromValue = (typeof HEARD_FROM_OPTIONS)[number]['value']

export type HeardFrom = { source: HeardFromValue; other?: string }

function isHeardFromValue(value: unknown): value is HeardFromValue {
  return HEARD_FROM_OPTIONS.some((o) => o.value === value)
}

/** An answer has been given, so the sign-up buttons can work. */
export function heardFromChosen(value: HeardFromValue | null): boolean {
  return value != null
}

function read(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as FirstTouch) : null
  } catch {
    return null
  }
}

/** The first touch in this browser, if one was recorded. */
export function getFirstTouch(): FirstTouch | null {
  return read()
}

/** Our own site, in any of its forms: never counted as a referrer. */
function isOwnHost(host: string): boolean {
  if (!host) return true
  if (host === window.location.host) return true
  const bare = host.replace(/^www\./, '').toLowerCase()
  return bare === 'songdrafts.com'
}

/** The whole referring address, unless it is us. */
function referringUrl(): string | undefined {
  try {
    if (!document.referrer) return undefined
    const url = new URL(document.referrer)
    if (isOwnHost(url.host)) return undefined
    return document.referrer.slice(0, 500)
  } catch {
    return undefined
  }
}

/**
 * A promo code from the address (?promo=UNHEARD20), kept for checkout.
 * Latest wins, upper case, letters and digits only, 40 characters.
 */
export function capturePromo() {
  try {
    const raw = new URLSearchParams(window.location.search).get('promo')
    if (!raw) return
    const code = raw.trim().toUpperCase()
    if (!/^[A-Z0-9]{1,40}$/.test(code)) return
    localStorage.setItem(PROMO_KEY, code)
  } catch {
    /* storage blocked: no promo, nothing else */
  }
}

/** The promo code this browser arrived with, if there is one. */
export function getPromo(): string | null {
  try {
    return localStorage.getItem(PROMO_KEY)
  } catch {
    return null
  }
}

/** Record the first visit. Never overwrites an existing first touch. */
export function captureFirstTouch() {
  try {
    capturePromo()
    if (localStorage.getItem(KEY)) return
    const q = new URLSearchParams(window.location.search)
    const touch: FirstTouch = { path: window.location.pathname, at: new Date().toISOString() }
    for (const p of PARAMS) {
      const v = q.get(p)
      if (v) touch[p] = v.slice(0, 120)
    }
    const full = referringUrl()
    if (full) {
      touch.referrer_url = full
      try {
        touch.referrer = new URL(full).host
      } catch {
        /* keep the full address, skip the host */
      }
    }
    localStorage.setItem(KEY, JSON.stringify(touch))
  } catch {
    /* storage blocked or a malformed referrer: no attribution, nothing else */
  }
}

/** Keep the answer to "How did you hear about songdrafts?" for the round trip
 *  through Google or a magic link. The latest answer on this page wins. */
export function setHeardFrom(heard: HeardFrom | null) {
  try {
    if (!heard || !isHeardFromValue(heard.source)) {
      localStorage.removeItem(HEARD_KEY)
      return
    }
    const other = heard.source === 'other' ? heard.other?.trim().slice(0, 120) : undefined
    localStorage.setItem(HEARD_KEY, JSON.stringify({ source: heard.source, other: other || undefined }))
  } catch {
    /* storage blocked: the account is still made, we just lose the answer */
  }
}

/** The stored answer, if one was given in this browser. */
export function getHeardFrom(): HeardFrom | null {
  try {
    const raw = localStorage.getItem(HEARD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HeardFrom>
    if (!isHeardFromValue(parsed.source)) return null
    return { source: parsed.source, other: typeof parsed.other === 'string' ? parsed.other : undefined }
  } catch {
    return null
  }
}

let inFlight = false
let sourceInFlight = false

/**
 * The source record in the database (migration 047): the answer plus the
 * first touch, on the caller's own row, written once. The RPC fills empty
 * fields only, so calling it twice cannot change anything.
 */
async function saveSourceOnce(client: AuthOnly, user: User) {
  try {
    if (sourceInFlight || !client.rpc) return
    if (localStorage.getItem(SOURCE_SAVED_KEY) === user.id) return
    const created = Date.parse(user.created_at)
    if (!Number.isFinite(created) || Date.now() - created > NEW_ACCOUNT_MS) return
    const heard = getHeardFrom()
    const touch = read()
    if (!heard && !touch) return
    sourceInFlight = true
    const { error } = await client.rpc('record_signup_source', {
      p_source: heard?.source ?? null,
      p_source_other: heard?.other ?? null,
      p_utm_source: touch?.utm_source ?? null,
      p_utm_medium: touch?.utm_medium ?? null,
      p_utm_campaign: touch?.utm_campaign ?? null,
      p_ref: touch?.ref ?? null,
      p_referrer: touch?.referrer_url ?? touch?.referrer ?? null,
      p_landing_path: touch?.path ?? null,
      p_captured_at: touch?.at ?? null,
    })
    // A failure leaves the key unset, so the next session tries again.
    if (!error) localStorage.setItem(SOURCE_SAVED_KEY, user.id)
  } catch {
    /* never in the way of signing in */
  } finally {
    sourceInFlight = false
  }
}

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
      if (user) {
        window.setTimeout(() => void saveOnce(client, user), 0)
        window.setTimeout(() => void saveSourceOnce(client, user), 0)
      }
    })
  } catch {
    /* ignore */
  }
}
