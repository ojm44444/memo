import { supabase } from '@/lib/supabase/client'

/**
 * What you are called.
 *
 * Until this existed there was no way to tell songdrafts your name, so every
 * comment you left was signed with the front half of your email address. On
 * your own board that is merely ugly. On a listen page you sent to a mix
 * engineer it is your email address, in public, next to your unfinished songs,
 * with no control anywhere in the UI to change it.
 *
 * Stored on the auth user's metadata, exactly like the avatar and for the same
 * reason: no migration, no table to keep in step, and it disappears with the
 * account. `profiles.display_name` still exists and is still seeded with the
 * email by `ensure_my_board()`; this is the value the app actually shows, and
 * it wins wherever both are present.
 */

const MAX_LENGTH = 40

/** Read the name. Falls back to the email prefix, then to "You". */
export async function getMyDisplayName(): Promise<string> {
  if (!supabase) return 'You'
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return 'You'
  return resolveDisplayName(user.user_metadata, user.email)
}

/**
 * The same resolution, on a user object you already have.
 *
 * Kept separate so the comment path does not make a second network call every
 * time someone types a note.
 */
export function resolveDisplayName(
  meta: Record<string, unknown> | undefined,
  email: string | null | undefined,
): string {
  const chosen = meta?.display_name
  if (typeof chosen === 'string' && chosen.trim()) return chosen.trim()

  // Google hands us a real name. Use it before falling back to the email.
  const fromProvider = meta?.full_name ?? meta?.name
  if (typeof fromProvider === 'string' && fromProvider.trim()) return fromProvider.trim()

  const prefix = email?.split('@')[0]
  return prefix || 'You'
}

/**
 * Has this person actually chosen a name, or are we guessing from their email?
 *
 * The Account panel uses this to place the prompt: someone who has never set a
 * name should be asked once, and someone who has should never be nagged again.
 */
export function hasChosenName(
  meta: Record<string, unknown> | undefined,
): boolean {
  const chosen = meta?.display_name
  if (typeof chosen === 'string' && chosen.trim()) return true
  const fromProvider = meta?.full_name ?? meta?.name
  return typeof fromProvider === 'string' && Boolean(fromProvider.trim())
}

export async function setMyDisplayName(name: string): Promise<string> {
  if (!supabase) throw new Error('Sign in required')
  const clean = name.trim().slice(0, MAX_LENGTH)
  if (!clean) throw new Error('Give yourself a name of at least one character.')

  const { error } = await supabase.auth.updateUser({ data: { display_name: clean } })
  if (error) throw error

  // Keep the profiles row in step where it exists. Best effort on purpose:
  // failing to mirror a name is not a reason to reject a name the person has
  // already been told was saved.
  await supabase
    .from('profiles')
    .update({ display_name: clean })
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .then(undefined, () => undefined)

  return clean
}
