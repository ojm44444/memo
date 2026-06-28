import { db } from '@/db/database'
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
 * Who can use the board right now?
 * Offline + expired JWT is NOT game over — we trust lastUserId until explicit sign-out.
 */
export async function resolveBoardAuth(): Promise<BoardAuth | null> {
  // If offline, skip the network call entirely and use the cached identity.
  if (!navigator.onLine) {
    const lastUserId = (await db.syncMeta.get('lastUserId'))?.value
    if (lastUserId) {
      const lastEmail = (await db.syncMeta.get('lastUserEmail'))?.value ?? ''
      return {
        user: { id: lastUserId, email: lastEmail } as User,
        offlineGrace: true,
      }
    }
    return null
  }

  const cached = await getCachedUser()
  if (cached) return { user: cached, offlineGrace: false }

  return null
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
