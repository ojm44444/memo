/**
 * Warm the lazily-loaded app chunks on intent (hover or touch on a link that
 * leads there), so route splitting costs nothing perceptible.
 *
 * Lives in its own module rather than App.tsx to avoid a circular import:
 * App imports LandingPage, and LandingPage needs this.
 *
 * Safe to call repeatedly, the module registry dedupes.
 */
export function prefetchAppChunks() {
  void import('@/pages/SignInPage')
  void import('@/pages/BoardPage')
}
