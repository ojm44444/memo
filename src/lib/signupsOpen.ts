/**
 * Are new signups open?
 *
 * songdrafts is not open for business until billing exists, but the sign-in
 * page has been live and unguarded the whole time, so anyone finding the site
 * could create an account while the landing page said "Not open yet". The sign
 * said closed and the door was unlocked.
 *
 * This closes the door without breaking anything:
 *
 *   - EXISTING accounts keep working. This gates the sign-in FORM, not the
 *     session. Anyone already signed in, on any device, notices nothing.
 *   - Owen keeps working. `?key=` on the sign-in URL lets him and anyone he
 *     deliberately invites straight through, so he can test, and so early
 *     testers can be let in one at a time without a deploy.
 *   - It is one constant to flip when Stripe is wired, not a page to rebuild.
 *
 * Deliberately NOT a server-side check. It is a front door, not a security
 * control: Supabase auth is what actually protects anything, and pretending a
 * client-side flag is security would be worse than being honest that it is a
 * sign on a door.
 */

/** Flip to true the day billing goes live. */
export const SIGNUPS_OPEN = false

/** Anyone with this on the URL gets in regardless. Change it when it leaks. */
const BYPASS_KEY = 'earlybird'

const BYPASS_STORAGE = 'sd-signup-bypass'

export function signupsAllowed(): boolean {
  if (SIGNUPS_OPEN) return true
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('key')
    if (fromUrl === BYPASS_KEY) {
      // Remembered so a magic link round trip does not bounce them back out:
      // the link lands on a fresh URL with no query string.
      localStorage.setItem(BYPASS_STORAGE, '1')
      return true
    }
    return localStorage.getItem(BYPASS_STORAGE) === '1'
  } catch {
    return false
  }
}
