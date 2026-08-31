import { db } from '@/db/database'
import { DEV_BYPASS_USER, isDevAuthBypass } from '@/lib/auth/devBypass'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export const EXPLICIT_SIGN_OUT_KEY = 'memo_explicit_sign_out'

export type BoardAuth = {
  user: User
  /** Session JWT missing but device still has this user's board (plane mode). */
  offlineGrace: boolean
}

/** Read cached session only — works offline (no network validation). */
export async function getCachedUser(): Promise<User | null> {
  if (!supabase) return null
  // Race getSession against a 3-second timeout so a stale/slow network
  // doesn't block the app from loading from local data.
  const sessionPromise = supabase.auth.getSession().then((r) => r.data.session?.user ?? null)
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
  return Promise.race([sessionPromise, timeoutPromise])
}

/**
 * The identity this device last signed in as, if any.
 *
 * Wiped by clearLocalUserBoard, so it exists only while this device still
 * holds a board belonging to someone.
 */
async function lastKnownUser(): Promise<User | null> {
  const lastUserId = (await db.syncMeta.get('lastUserId'))?.value
  if (!lastUserId) return null
  const lastEmail = (await db.syncMeta.get('lastUserEmail'))?.value ?? ''
  return { id: lastUserId, email: lastEmail } as User
}

/**
 * Who can use the board right now?
 * Offline + expired JWT is NOT game over — we trust lastUserId until explicit sign-out.
 */
export async function resolveBoardAuth(): Promise<BoardAuth | null> {
  // Dev-only UI testing bypass — see devBypass.ts. Sync stays disabled.
  if (isDevAuthBypass()) {
    return { user: DEV_BYPASS_USER, offlineGrace: false }
  }

  // If offline, skip the network call entirely and use the cached identity.
  if (!navigator.onLine) {
    const last = await lastKnownUser()
    return last ? { user: last, offlineGrace: true } : null
  }

  const cached = await getCachedUser()
  if (cached) return { user: cached, offlineGrace: false }

  /**
   * ONLINE, BUT WE COULD NOT CONFIRM. This is not the same as signed out, and
   * treating it as such was destroying people's music.
   *
   * getCachedUser gives up after three seconds and returns null, and a token
   * refresh can be refused rather than merely slow: a rate limit, a quota
   * block, a proxy, a captive portal, a Supabase incident. In every one of
   * those cases navigator.onLine is true, so the offline branch above never
   * ran, this returned null, and AuthGate took null to mean signed out and
   * wiped IndexedDB, audio blobs and the unsynced queue included.
   *
   * The device still holding a board is the evidence that matters. Someone who
   * actually signs out has their lastUserId cleared along with everything
   * else, so this cannot resurrect an account that was deliberately left.
   */
  const last = await lastKnownUser()
  return last ? { user: last, offlineGrace: true } : null
}

export async function getBoardUserId(): Promise<string | null> {
  const auth = await resolveBoardAuth()
  return auth?.user.id ?? null
}

export function markExplicitSignOut() {
  sessionStorage.setItem(EXPLICIT_SIGN_OUT_KEY, '1')
}

export function consumeExplicitSignOut() {
  const value = sessionStorage.getItem(EXPLICIT_SIGN_OUT_KEY) === '1'
  sessionStorage.removeItem(EXPLICIT_SIGN_OUT_KEY)
  return value
}
