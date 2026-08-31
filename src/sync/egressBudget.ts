/**
 * A hard ceiling on how much this device will download on its own.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A NICE-TO-HAVE.
 *
 * A loop in the sync code re-downloaded the same audio files every eight
 * seconds and turned eleven megabytes of uploads into 6.21 GB of bandwidth.
 * Nobody spotted it. What spotted it was the free tier running out, which is a
 * smoke alarm made of running out of quota, and the plan we are on now has
 * roughly forty times the allowance. The same bug on this plan would burn
 * quietly for weeks and then take the app offline, and the version of that
 * with a spend cap switched off is a bill.
 *
 * So the specific bug is fixed AND this exists, because the next runaway loop
 * will be one nobody predicted. A budget does not care what the bug is. It
 * counts bytes, and when the number stops making sense it stops paying.
 *
 * WHAT IT DOES NOT COVER: this governs downloads the app starts BY ITSELF.
 * A person pressing "Download cloud audio" is not a runaway loop, so that path
 * passes `force` and is exempt. Uploads are not metered the same way and are
 * driven by a person adding files, so they are not counted here either.
 *
 * Deliberately generous. A whole library is a few hundred megabytes and is
 * fetched once. Two gigabytes in a day is far more than legitimate automatic
 * use and far less than an allowance, so a runaway is caught in hours instead
 * of weeks, and nobody normal ever meets it.
 */

const STORAGE_KEY = 'songdrafts:egress-budget'

/** Per device, per day, for downloads the app decides to make on its own. */
export const DAILY_AUTO_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024

interface BudgetRecord {
  /** UTC date, so the window cannot be reset by changing timezone. */
  day: string
  bytes: number
  /** Set once when the ceiling is first hit, so the UI can say so. */
  trippedAt?: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function read(): BudgetRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BudgetRecord
      if (parsed.day === today() && typeof parsed.bytes === 'number') return parsed
    }
  } catch {
    // Private window, storage disabled, corrupt value. Start fresh.
  }
  return { day: today(), bytes: 0 }
}

function write(record: BudgetRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    /**
     * Storage unavailable. Fail OPEN rather than closed.
     *
     * A budget that cannot be persisted would otherwise block every automatic
     * download in a private window, which breaks a working app to prevent a
     * bug that might not exist. The backoff in audioDownload is the other
     * layer, and the plan's own quota is the last one.
     */
  }
}

/** Is the app still allowed to fetch audio on its own initiative? */
export function canAutoDownload(): boolean {
  return read().bytes < DAILY_AUTO_DOWNLOAD_BYTES
}

/** Count bytes the app fetched by itself. Never called for a manual fetch. */
export function recordAutoDownload(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return
  const record = read()
  const next: BudgetRecord = { ...record, bytes: record.bytes + bytes }
  if (!next.trippedAt && next.bytes >= DAILY_AUTO_DOWNLOAD_BYTES) {
    next.trippedAt = new Date().toISOString()
  }
  write(next)
}

/** For Settings, so an unexplained stop is visible rather than mysterious. */
export function getBudgetState(): {
  bytes: number
  limit: number
  tripped: boolean
} {
  const record = read()
  return {
    bytes: record.bytes,
    limit: DAILY_AUTO_DOWNLOAD_BYTES,
    tripped: Boolean(record.trippedAt),
  }
}

/** Test seam. Also the honest way for a person to override their own guard. */
export function resetEgressBudget(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
