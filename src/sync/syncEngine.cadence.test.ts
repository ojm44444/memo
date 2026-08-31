import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * How often this app talks to Supabase, which is the bill.
 *
 * The loop used to be setInterval(8s) for as long as the tab existed, hidden
 * or not, active or not. Each tick is a pull plus a push, so one forgotten tab
 * was tens of thousands of requests a day asking a question whose answer never
 * changed. These tests are here so that cannot come back quietly.
 */

const pullChanges = vi.fn(async () => ({ pulled: 0 }))
const pushChanges = vi.fn(async () => ({ pushed: 0, failed: 0, lastFailure: null as string | null }))
const cachePendingRemoteAudio = vi.fn(async () => ({
  attempted: 0,
  cached: 0,
  remaining: 0,
  deferred: 0,
}))

vi.mock('./pullChanges', () => ({ pullChanges }))
vi.mock('./pushChanges', () => ({ pushChanges }))
vi.mock('./audioDownload', () => ({ cachePendingRemoteAudio }))
vi.mock('@/lib/auth/session', () => ({ getBoardUserId: async () => 'user-1' }))
vi.mock('@/lib/auth/devBypass', () => ({ isDevAuthBypass: () => false }))
vi.mock('@/lib/supabase/client', () => ({ supabaseConfigured: true, supabase: {} }))
vi.mock('@/db/repositories/outboxRepo', () => ({
  getPendingSyncCount: async () => 0,
  getFirstSyncError: async () => null,
  getPendingHint: async () => null,
}))

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  })
}

/** Advance time and let the promise chain between timers settle. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('sync poll cadence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    pullChanges.mockClear()
    pushChanges.mockClear()
    setHidden(false)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  afterEach(async () => {
    const { setCloudSyncEnabled } = await import('./syncEngine')
    setCloudSyncEnabled(false)
    vi.useRealTimers()
  })

  it('slows down when nothing is happening instead of polling forever at 8s', async () => {
    const { setCloudSyncEnabled } = await import('./syncEngine')
    setCloudSyncEnabled(true)
    await advance(0)

    const afterFirst = pullChanges.mock.calls.length
    expect(afterFirst).toBe(1)

    // Five quiet minutes. At the old fixed 8s that is ~37 rounds.
    await advance(5 * 60_000)

    // The ladder is 8s, 15, 30, 60, 120, then 300, so five minutes of silence
    // buys a handful of rounds rather than dozens.
    expect(pullChanges.mock.calls.length).toBeLessThan(10)
  })

  it('does not poll at all while the tab is hidden', async () => {
    const { setCloudSyncEnabled } = await import('./syncEngine')
    setCloudSyncEnabled(true)
    await advance(0)

    const before = pullChanges.mock.calls.length
    setHidden(true)
    await advance(60_000)

    expect(pullChanges.mock.calls.length).toBe(before)
  })

  it('goes straight back to attentive after a round that found something', async () => {
    const { setCloudSyncEnabled, flush } = await import('./syncEngine')
    setCloudSyncEnabled(true)
    await advance(0)

    // Let it get bored.
    await advance(5 * 60_000)

    // A bandmate's change arrives.
    pullChanges.mockResolvedValueOnce({ pulled: 3 })
    await flush()
    const after = pullChanges.mock.calls.length

    // The next round is back to the short delay, not the long one.
    await advance(9_000)
    expect(pullChanges.mock.calls.length).toBeGreaterThan(after)
  })
})
