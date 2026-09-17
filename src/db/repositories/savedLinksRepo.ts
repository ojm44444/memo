import { supabase } from '@/lib/supabase/client'

/**
 * Playlists someone shared with you, saved to your own songdrafts
 * (17 Sept, Owen: people he sends a link to should be able to keep it, and
 * find it again once they have an account).
 *
 * Only the link is saved, never a copy of the music: the owner still decides
 * how long it works and can switch it off.
 */

export interface SavedLink {
  token: string
  title: string | null
  artist: string | null
  cover_path: string | null
  saved_at: string
}

const PENDING_KEY = 'sd-pending-saved-link'

type Pending = { token: string; title: string | null; artist: string | null; cover_path: string | null }

export async function isSignedIn() {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

export async function saveLink(link: Pending) {
  if (!supabase) throw new Error('Not available')
  const { error } = await supabase
    .from('saved_collection_links' as never)
    .upsert(link as never, { onConflict: 'user_id,token' })
  if (error) throw new Error('That did not save. Try again.')
}

export async function listSavedLinks(): Promise<SavedLink[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('saved_collection_links' as never)
    .select('token, title, artist, cover_path, saved_at')
    .order('saved_at', { ascending: false })
  if (error) return []
  return (data ?? []) as unknown as SavedLink[]
}

export async function removeSavedLink(token: string) {
  if (!supabase) return
  await supabase.from('saved_collection_links' as never).delete().eq('token', token)
}

/** Not signed in yet: remember the link through sign-up, save it after. */
export function rememberPendingLink(link: Pending) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(link))
  } catch {
    /* private window: they can press Save again after signing in */
  }
}

export async function savePendingLink(): Promise<boolean> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PENDING_KEY)
  } catch {
    return false
  }
  if (!raw || !(await isSignedIn())) return false
  try {
    await saveLink(JSON.parse(raw) as Pending)
    localStorage.removeItem(PENDING_KEY)
    return true
  } catch {
    return false
  }
}
