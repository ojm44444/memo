import { describe, expect, it, vi } from 'vitest'
import {
  HANDOFF_WINDOW_MS,
  HandoffScheduler,
  MAX_LEAD_MS,
  msUntilHandoff,
  nextLeadMs,
  otherDeck,
  type HandoffClock,
  type HandoffReading,
} from './gapless'

/**
 * Gapless playback (18 Sept 2026, Owen: "true gapless playback"). The next
 * track waits on a second element and is started a few milliseconds before
 * the current one ends. These tests hold the timing: when the start fires,
 * that it fires once, and that seeks, speed and pauses move it.
 */

function fakeClock() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const clock: HandoffClock = {
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (id) => {
      timers.delete(id as number)
    },
  }
  const advance = (ms: number) => {
    const target = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = target
  }
  return { clock, advance, pending: () => timers.size, now: () => now }
}

describe('msUntilHandoff', () => {
  it('is the real time left, less the lead', () => {
    expect(msUntilHandoff({ currentTimeSec: 9, endSec: 10, rate: 1, leadMs: 20 })).toBe(980)
  })

  it('shrinks with speed and grows when slowed', () => {
    expect(msUntilHandoff({ currentTimeSec: 8, endSec: 10, rate: 2, leadMs: 0 })).toBe(1000)
    expect(msUntilHandoff({ currentTimeSec: 9.25, endSec: 10, rate: 0.75, leadMs: 0 })).toBe(1000)
  })

  it('treats a broken rate as normal speed', () => {
    expect(msUntilHandoff({ currentTimeSec: 9, endSec: 10, rate: 0, leadMs: 0 })).toBe(1000)
  })

  it('uses a trim end when that is the end', () => {
    expect(msUntilHandoff({ currentTimeSec: 60, endSec: 61.5, rate: 1, leadMs: 0 })).toBe(1500)
  })
})

describe('nextLeadMs', () => {
  it('moves toward the measured start latency', () => {
    const lead = nextLeadMs(0, 20)
    expect(lead).toBeGreaterThan(0)
    expect(lead).toBeLessThan(20)
    let settled = 0
    for (let i = 0; i < 30; i++) settled = nextLeadMs(settled, 20)
    expect(settled).toBeCloseTo(20, 1)
  })

  it('never lets a stall make tracks overlap by much', () => {
    let lead = 0
    for (let i = 0; i < 30; i++) lead = nextLeadMs(lead, 5000)
    expect(lead).toBeLessThanOrEqual(MAX_LEAD_MS)
  })

  it('ignores nonsense measurements', () => {
    expect(nextLeadMs(12, Number.NaN)).toBe(12)
    expect(nextLeadMs(12, -5)).toBe(12)
  })
})

describe('HandoffScheduler', () => {
  function setup(initial: HandoffReading | null) {
    const { clock, advance, pending } = fakeClock()
    let reading = initial
    const onDue = vi.fn()
    const scheduler = new HandoffScheduler(() => reading, onDue, clock)
    return {
      scheduler,
      onDue,
      advance,
      pending,
      set: (next: HandoffReading | null) => {
        reading = next
      },
    }
  }

  it('does nothing while the end is far away', () => {
    const t = setup({ currentTimeSec: 10, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    expect(t.pending()).toBe(0)
    expect(t.onDue).not.toHaveBeenCalled()
  })

  it('arms inside the window and fires at the end minus the lead, once', () => {
    const t = setup({ currentTimeSec: 199.5, endSec: 200, rate: 1, leadMs: 10 })
    t.scheduler.poke()
    expect(t.pending()).toBe(1)
    t.advance(489)
    expect(t.onDue).not.toHaveBeenCalled()
    // The timer reads again when it fires; the element has moved on with it.
    t.set({ currentTimeSec: 199.99, endSec: 200, rate: 1, leadMs: 10 })
    t.advance(1)
    expect(t.onDue).toHaveBeenCalledTimes(1)
    t.scheduler.poke()
    t.advance(2000)
    expect(t.onDue).toHaveBeenCalledTimes(1)
    expect(t.scheduler.hasFired).toBe(true)
  })

  it('re-arms when the timer runs early or someone seeks back', () => {
    const t = setup({ currentTimeSec: 199.2, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    // Seeked back inside the window before the timer fired.
    t.set({ currentTimeSec: 199.5, endSec: 200, rate: 1, leadMs: 0 })
    t.advance(800)
    expect(t.onDue).not.toHaveBeenCalled()
    expect(t.pending()).toBe(1)
    t.set({ currentTimeSec: 200, endSec: 200, rate: 1, leadMs: 0 })
    t.advance(500)
    expect(t.onDue).toHaveBeenCalledTimes(1)
  })

  it('disarms on pause and when seeked away from the end', () => {
    const t = setup({ currentTimeSec: 199.5, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    expect(t.pending()).toBe(1)
    t.set(null)
    t.scheduler.poke()
    expect(t.pending()).toBe(0)
    t.set({ currentTimeSec: 199.5, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    t.set({ currentTimeSec: 30, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    expect(t.pending()).toBe(0)
    t.advance(5000)
    expect(t.onDue).not.toHaveBeenCalled()
  })

  it('fires at once when the end has already been reached (a late tick)', () => {
    const t = setup({ currentTimeSec: 200, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    expect(t.onDue).toHaveBeenCalledTimes(1)
  })

  it('arms earlier in content time at double speed', () => {
    // 1.8 s of song at 2x is 900 ms of real time: inside the window.
    const t = setup({ currentTimeSec: 198.2, endSec: 200, rate: 2, leadMs: 0 })
    t.scheduler.poke()
    expect(t.pending()).toBe(1)
    expect(HANDOFF_WINDOW_MS).toBeGreaterThanOrEqual(900)
  })

  it('is ready for the next track after reset, and quiet after cancel', () => {
    const t = setup({ currentTimeSec: 200, endSec: 200, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    t.scheduler.reset()
    t.set({ currentTimeSec: 99.5, endSec: 100, rate: 1, leadMs: 0 })
    t.scheduler.poke()
    t.scheduler.cancel()
    t.advance(1000)
    expect(t.onDue).toHaveBeenCalledTimes(1)
    t.scheduler.poke()
    t.set({ currentTimeSec: 100, endSec: 100, rate: 1, leadMs: 0 })
    t.advance(1000)
    expect(t.onDue).toHaveBeenCalledTimes(2)
  })
})

describe('otherDeck', () => {
  it('is the element that is not playing', () => {
    const a = document.createElement('audio')
    const b = document.createElement('audio')
    expect(otherDeck([a, b], a)).toBe(b)
    expect(otherDeck([a, b], b)).toBe(a)
    expect(otherDeck([a, null], a)).toBe(null)
  })
})
