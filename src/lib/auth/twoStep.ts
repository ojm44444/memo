import { supabase } from '@/lib/supabase/client'

/**
 * Two-step login with an authenticator app (17 Sept, Owen). Optional per
 * person. Once on, every new sign-in asks for the 6-digit code from the app,
 * and the database itself refuses that account's data until the code is
 * given (migration 044), so it is not only a screen.
 */

export async function getTwoStepFactor() {
  if (!supabase) return null
  const { data } = await supabase.auth.mfa.listFactors()
  return data?.totp?.find((f) => f.status === 'verified') ?? null
}

/** True when this session still owes a code before the board can open. */
export async function needsTwoStepCode(): Promise<boolean> {
  if (!supabase || !navigator.onLine) return false
  // A weak signal reports online but never answers. Opening the board from
  // this device must not wait on it (the database still refuses cloud data
  // without the code), so give up after a few seconds and on any failure.
  const check = supabase.auth.mfa
    .getAuthenticatorAssuranceLevel()
    .then(({ data, error }) => (error || !data ? false : data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'))
    .catch(() => false)
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000))
  return Promise.race([check, timeout])
}

export async function startTwoStepSetup() {
  if (!supabase) throw new Error('Not available')
  // Clear any half-finished setup first, or enrolling again is refused.
  const { data: list } = await supabase.auth.mfa.listFactors()
  for (const f of list?.all ?? []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `songdrafts ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error || !data) throw new Error('Two-step login could not start. Try again.')
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyTwoStepCode(factorId: string, code: string) {
  if (!supabase) throw new Error('Not available')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, '') })
  if (error) throw new Error('That code did not match. Check the app and try again.')
}

export async function turnOffTwoStep(factorId: string) {
  if (!supabase) throw new Error('Not available')
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error('Could not turn it off. Sign in again with your code, then try.')
}
