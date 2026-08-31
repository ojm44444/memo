import { describe, expect, it } from 'vitest'
import { hasAuthCallback } from './authLanding'

/**
 * The detection half is what actually decides this, and it is the half that
 * can quietly break: a false negative strands someone on the landing page
 * after they have signed in, and a false positive would bounce an ordinary
 * visitor to a board they cannot see.
 */
const at = (search: string, hash = '') =>
  ({ search, hash }) as Location

describe('hasAuthCallback', () => {
  it('sees a PKCE code', () => {
    expect(hasAuthCallback(at('?code=a08bb850-ac5a-45f5-b853-887f26611f01'))).toBe(true)
  })

  it('sees an implicit-flow token in the hash', () => {
    expect(hasAuthCallback(at('', '#access_token=abc&type=magiclink'))).toBe(true)
  })

  it('sees a refusal, which also needs handling rather than dropping', () => {
    expect(hasAuthCallback(at('?error=access_denied&error_code=otp_expired'))).toBe(true)
  })

  it('ignores a plain visit', () => {
    expect(hasAuthCallback(at(''))).toBe(false)
  })

  it('ignores the params the landing page uses for its own purposes', () => {
    // ?key= is the signup bypass and ?share= is an import handoff. Neither is
    // an auth callback, and redirecting either to /app would break it.
    expect(hasAuthCallback(at('?key=earlybird'))).toBe(false)
    expect(hasAuthCallback(at('?share=abc123'))).toBe(false)
  })

  it('ignores ad and analytics tags, which arrive on every paid click', () => {
    expect(
      hasAuthCallback(at('?utm_source=reddit&utm_campaign=launch&fbclid=xyz')),
    ).toBe(false)
  })
})
