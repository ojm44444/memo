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

/**
 * First-party product events.
 *
 * Vercel Analytics is anonymous and aggregate, so it cannot answer the four
 * questions the business actually turns on: does someone import more than
 * once, come back another day, move a card right, and name a song. Those need
 * per-account events.
 *
 * PRIVACY IS THE CONSTRAINT. The landing page promises nobody browses your
 * songs, so this sends event names and numbers only. Never a title, never a
 * filename, never a note. If you are tempted to add one, the honest answer is
 * that the metric is not worth the promise.
 *
 * Best-effort in every direction: signed out, offline, blocked, or a failed
 * insert all fail silently. Analytics must never interrupt someone's work.
 */
type EventName =
  | 'session_start'
  | 'import_completed'
  | 'song_moved'
  | 'song_renamed'
  | 'playback_started'
  | 'share_created'
  | 'song_merged'
  | 'take_added'

export async function recordEvent(name: EventName, value?: number, bucket?: string) {
  try {
    const { supabase } = await import('@/lib/supabase/client')
    if (!supabase) return
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return

    // Cast for the same reason as the admin summary: the checked-in Supabase
    // types predate this table. The shape is enforced by the table's own
    // constraints, which is the check that actually matters.
    await (supabase.from('product_events') as unknown as {
      insert: (row: Record<string, unknown>) => Promise<unknown>
    }).insert({
      user_id: userId,
      name,
      value: value ?? null,
      bucket: bucket ? bucket.slice(0, 40) : null,
    })
  } catch {
    // Never surface. See above.
  }
}

/** Once per calendar day per device, so "returned another day" is meaningful. */
const SESSION_KEY = 'songdrafts:session-day'
export function recordSessionOncePerDay() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(SESSION_KEY) === today) return
    localStorage.setItem(SESSION_KEY, today)
    void recordEvent('session_start')
  } catch {
    // Storage unavailable in private mode. Fine.
  }
}
