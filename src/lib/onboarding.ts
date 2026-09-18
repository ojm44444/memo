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

/**
 * The floating Help button (18 Sept, Owen: "not be there all the time").
 * It shows until the guide is done and for the first few app opens after
 * that, then steps aside. Help and the guide stay in Settings for good.
 */
export const HELP_FAB_OPENS = 3
const HELP_OPENS_KEY = 'sd-help-opens'
const HELP_COUNTED_KEY = 'sd-help-counted'
const HELP_HIDDEN_KEY = 'sd-help-hidden'

/** Counts this app open once per browser session and returns the total. */
export function countAppOpen(): number {
  try {
    let opens = Number(localStorage.getItem(HELP_OPENS_KEY) ?? '0') || 0
    if (sessionStorage.getItem(HELP_COUNTED_KEY) !== '1') {
      opens += 1
      localStorage.setItem(HELP_OPENS_KEY, String(opens))
      sessionStorage.setItem(HELP_COUNTED_KEY, '1')
    }
    return opens
  } catch {
    return 1
  }
}

export function isHelpFabHidden(): boolean {
  try {
    return localStorage.getItem(HELP_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function hideHelpFab() {
  try {
    localStorage.setItem(HELP_HIDDEN_KEY, '1')
  } catch {
    /* it steps aside on its own after a few opens anyway */
  }
}

/**
 * SUPPORT EMAIL IS A PLACEHOLDER: songdraftsapp@gmail.com has no mailbox behind
 * it yet. Owen has to create the address (or a forward) before launch, or this
 * line is a promise the product does not keep.
 */
export const SUPPORT_EMAIL = 'songdraftsapp@gmail.com'
