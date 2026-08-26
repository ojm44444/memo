import { db } from '@/db/database'

const ASKED_KEY = 'storagePersistAsked'
const RESULT_KEY = 'storagePersistGranted'

/**
 * Ask the browser not to evict this origin's data.
 *
 * Without this, a browser under storage pressure can silently clear
 * IndexedDB, which in this app means someone's unreleased songs. Requested on
 * first import rather than on boot, because browsers weight the prompt on
 * engagement and a first-run request is more likely to be refused outright.
 *
 * Best-effort by design: unsupported browsers and refusals both just record
 * the outcome. The result is surfaced honestly in Settings rather than being
 * quietly assumed.
 */
export async function requestStoragePersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    await db.syncMeta.put({ key: RESULT_KEY, value: 'unsupported' })
    return null
  }

  try {
    // Already granted, e.g. because the app was installed to the home screen.
    if (await navigator.storage.persisted()) {
      await db.syncMeta.put({ key: RESULT_KEY, value: 'true' })
      return true
    }

    const asked = await db.syncMeta.get(ASKED_KEY)
    if (asked?.value === 'true') {
      return (await db.syncMeta.get(RESULT_KEY))?.value === 'true'
    }

    const granted = await navigator.storage.persist()
    await db.syncMeta.put({ key: ASKED_KEY, value: 'true' })
    await db.syncMeta.put({ key: RESULT_KEY, value: String(granted) })
    console.info(`[songdrafts] storage persistence: ${granted ? 'granted' : 'refused'}`)
    return granted
  } catch (err) {
    console.warn('[songdrafts] storage persistence request failed:', err)
    return null
  }
}

export type StorageState = {
  persisted: boolean | null
  usageBytes: number | null
  quotaBytes: number | null
}

/** What Settings and the storage badge report. Never guesses. */
export async function getStorageState(): Promise<StorageState> {
  const stored = (await db.syncMeta.get(RESULT_KEY))?.value
  let persisted: boolean | null =
    stored === 'true' ? true : stored === 'false' ? false : null

  let usageBytes: number | null = null
  let quotaBytes: number | null = null

  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted()
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      usageBytes = est.usage ?? null
      quotaBytes = est.quota ?? null
    }
  } catch {
    // Leave the honest nulls in place.
  }

  return { persisted, usageBytes, quotaBytes }
}
