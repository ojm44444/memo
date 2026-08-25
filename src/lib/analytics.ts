import { track } from '@vercel/analytics'

const FIRST_IMPORT_KEY = 'songdrafts:first-import-tracked'

/**
 * Activation, not signup, is the moment that matters: a signup is a stranger
 * on a list, a first successful audio import is someone who has actually put
 * their music in. Fires once per device, ever.
 *
 * Deliberately best-effort. Analytics must never break an import, so every
 * failure path (storage unavailable in private mode, blocked script) is
 * swallowed.
 */
export function trackFirstImport(fileCount: number) {
  try {
    if (localStorage.getItem(FIRST_IMPORT_KEY)) return
    localStorage.setItem(FIRST_IMPORT_KEY, new Date().toISOString())
    track('first_audio_import', { files: fileCount })
  } catch {
    // Storage or analytics unavailable. Not worth surfacing.
  }
}
