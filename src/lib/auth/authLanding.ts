/**
 * Catch a sign-in that came back to the wrong page.
 *
 * Supabase sends people to the redirect URL we ask for ONLY if that exact URL
 * is in the project's allow-list. Anything else falls back to the project's
 * Site URL, which is the root. So on any deployment that is not in the list,
 * including every Vercel preview domain, a completed sign-in lands on `/`
 * carrying `?code=...` instead of on `/app`.
 *
 * That was bad in a specific and confusing way. The landing route deliberately
 * never loads the Supabase client, so the code sat in the URL unexchanged and
 * the visitor saw the marketing page as though nothing had happened. Clicking
 * "Sign in" a second time then loaded the client, which by that point had
 * picked the code up, found a session, and jumped straight to the board. Two
 * clicks, a bounce through the sales page in the middle, and no explanation.
 *
 * This is a front door mat, not a fix for the allow-list: the redirect URLs
 * should still be configured. But it makes the app correct on any domain,
 * which matters most on the preview URLs used for testing, where nobody is
 * going to keep the allow-list in step.
 */

/** The query keys Supabase can hand back after a redirect. */
const AUTH_PARAMS = ['code', 'error', 'error_description', 'error_code']

/**
 * True if this URL is carrying the result of a sign-in attempt.
 *
 * The hash is checked as well as the query. PKCE returns `?code=`, but a
 * recovery or an older implicit-flow link returns `#access_token=`, and both
 * are equally lost on a page that never starts the client.
 */
export function hasAuthCallback(location: Location = window.location): boolean {
  const params = new URLSearchParams(location.search)
  if (AUTH_PARAMS.some((k) => params.has(k))) return true
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  return new URLSearchParams(hash).has('access_token')
}

/**
 * Move an auth callback off the landing page and onto the board.
 *
 * Returns true when it has started a navigation, so the caller can skip
 * rendering: painting the landing page for the instant before the redirect is
 * the flash this is meant to remove.
 *
 * `replace` rather than `assign` so the callback URL, which contains a
 * single-use code, does not sit in history where a back button would replay
 * it and fail.
 */
export function redirectAuthCallbackToBoard(): boolean {
  if (window.location.pathname !== '/') return false
  if (!hasAuthCallback()) return false

  window.location.replace(`/app${window.location.search}${window.location.hash}`)
  return true
}

/**
 * Take the finished sign-in out of the address bar.
 *
 * After a successful exchange the URL still reads
 * `/app?code=c7350887-9f66-...`. The code is single use, so this is not a
 * security hole, but it ends up in bookmarks, in screenshots, and in the
 * "here is my board" link people paste at each other, and a reload re-runs the
 * exchange path for a code that is already spent.
 *
 * replaceState rather than a navigation: it leaves the router alone and does
 * not add a history entry, so back still goes where the user expects.
 *
 * Only the auth keys are stripped. Anything else on the query belongs to the
 * app (`?demo=1`, `?shot=1` and the invite flow all use it) and must survive.
 */
export function clearAuthCallbackFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return

  const url = new URL(window.location.href)
  let changed = false

  for (const key of AUTH_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (hash && new URLSearchParams(hash).has('access_token')) {
    url.hash = ''
    changed = true
  }

  if (!changed) return
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
