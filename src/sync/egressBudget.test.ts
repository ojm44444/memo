import { beforeEach, describe, expect, it } from 'vitest'
import {
  DAILY_AUTO_DOWNLOAD_BYTES,
  canAutoDownload,
  getBudgetState,
  recordAutoDownload,
  resetEgressBudget,
} from './egressBudget'

/**
 * The backstop. The specific loop that burned 6.21 GB is fixed; this is here
 * for the next one, which will be a loop nobody predicted.
 */
describe('egress budget', () => {
  beforeEach(() => resetEgressBudget())

  it('allows normal use without complaint', () => {
    // A whole library, fetched once. Nowhere near the ceiling.
    recordAutoDownload(400 * 1024 * 1024)
    expect(canAutoDownload()).toBe(true)
    expect(getBudgetState().tripped).toBe(false)
  })

  it('stops a runaway before it can spend a plan allowance', () => {
    // The real shape: the same file, over and over, forever.
    const file = 3 * 1024 * 1024
    let downloads = 0
    while (canAutoDownload() && downloads < 100_000) {
      recordAutoDownload(file)
      downloads++
    }

    expect(canAutoDownload()).toBe(false)
    expect(getBudgetState().tripped).toBe(true)
    // Capped in the low gigabytes, not the hundreds.
    expect(downloads * file).toBeLessThan(DAILY_AUTO_DOWNLOAD_BYTES + file)
  })

  it('still lets a person download when they ask, by not consulting it', () => {
    // force bypasses the check in cachePendingRemoteAudio, so the guard never
    // stands between someone and their own music.
    recordAutoDownload(DAILY_AUTO_DOWNLOAD_BYTES)
    expect(canAutoDownload()).toBe(false)
    resetEgressBudget()
    expect(canAutoDownload()).toBe(true)
  })

  it('ignores nonsense sizes rather than corrupting the count', () => {
    recordAutoDownload(Number.NaN)
    recordAutoDownload(-5)
    expect(getBudgetState().bytes).toBe(0)
  })
})
