import { db } from '@/db/database'
import { supabase } from '@/lib/supabase/client'

const ONBOARDING_TOUR_KEY = 'onboardingTourComplete'
/** Session-only snooze: "Remind me later" hides it until the next time the app opens. */
const SNOOZE_KEY = 'sd-tour-snoozed'

/**
 * Done is kept on the account as well as on this device (17 Sept, Owen: he
 * logged back in and got the tour again). Signing out clears this device's
 * database, so a device-only flag forgot it every time.
 */
export async function isOnboardingTourComplete() {
  const meta = await db.syncMeta.get(ONBOARDING_TOUR_KEY)
  if (meta?.value === 'true') return true
  try {
    if (sessionStorage.getItem(SNOOZE_KEY) === '1') return true
  } catch {
    /* no session storage: just ask */
  }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user.user_metadata?.onboarding_done === true) {
      await db.syncMeta.put({ key: ONBOARDING_TOUR_KEY, value: 'true' })
      return true
    }
  }
  return false
}

export async function setOnboardingTourComplete() {
  await db.syncMeta.put({ key: ONBOARDING_TOUR_KEY, value: 'true' })
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) void supabase.auth.updateUser({ data: { onboarding_done: true } })
  }
}

export function snoozeOnboardingTour() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, '1')
  } catch {
    /* fine: it asks again on the next load */
  }
}

export async function resetOnboardingTour() {
  await db.syncMeta.delete(ONBOARDING_TOUR_KEY)
}
