import { db } from '@/db/database'

const ONBOARDING_TOUR_KEY = 'onboardingTourComplete'

export async function isOnboardingTourComplete() {
  const meta = await db.syncMeta.get(ONBOARDING_TOUR_KEY)
  return meta?.value === 'true'
}

export async function setOnboardingTourComplete() {
  await db.syncMeta.put({ key: ONBOARDING_TOUR_KEY, value: 'true' })
}

export async function resetOnboardingTour() {
  await db.syncMeta.delete(ONBOARDING_TOUR_KEY)
}
