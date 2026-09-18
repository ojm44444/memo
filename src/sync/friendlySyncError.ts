/**
 * What the sync badge says when something goes wrong.
 *
 * It used to print the raw exception. On 18 Sept that was Postgres refusing a
 * fractional card position ("invalid input syntax for type integer"), which
 * Owen read as "Syntax error" next to "In cloud". Raw errors tell the person
 * nothing they can act on, so the badge gets one short plain line and the
 * detail goes to the console for whoever is fixing it.
 */
export function friendlySyncError(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.trim()
  const pending = /^(\d+) uploads? not finished/i.exec(text)
  if (pending) return `${pending[1]} not synced yet. Tap to retry.`
  if (/sign in|signed out|session expired|jwt|not authenticated|refresh token|\b401\b/i.test(text)) {
    return 'Sign in again to sync.'
  }
  if (/egress|quota|restricted|\b402\b|exceed/i.test(text)) return 'Cloud paused. Saved on this device.'
  if (/failed to fetch|networkerror|load failed|network|timed? ?out|offline|aborted/i.test(text)) {
    return "Can't reach the cloud. Saved here."
  }
  if (/permission|not allowed|row-level security|\b403\b/i.test(text)) return "You can't change this board."
  if (/not configured/i.test(text)) return 'Cloud sync is off.'
  if (/missing on this device/i.test(text)) return 'A take is missing here. Import it again.'
  if (/not reached the cloud yet/i.test(text)) return 'Still syncing. Tap to retry.'
  return 'Sync problem. Tap to retry.'
}
