import { describe, expect, it } from 'vitest'
import { JUST_OPENED_MS, shouldReloadNow, type UiState } from './updatePolicy'

const base: UiState = {
  onAppRoute: true,
  editing: false,
  playing: false,
  hidden: false,
  sinceLoadMs: 1_000,
}

describe('PWA update reload policy', () => {
  it('reloads a stale build straight after launch', () => {
    expect(shouldReloadNow(base)).toBe(true)
  })

  it('never reloads while typing or playing', () => {
    expect(shouldReloadNow({ ...base, editing: true })).toBe(false)
    expect(shouldReloadNow({ ...base, playing: true })).toBe(false)
    expect(shouldReloadNow({ ...base, playing: true, hidden: true })).toBe(false)
  })

  it('mid-session waits for the background', () => {
    const mid = { ...base, sinceLoadMs: JUST_OPENED_MS + 60_000 }
    expect(shouldReloadNow(mid)).toBe(false)
    expect(shouldReloadNow({ ...mid, hidden: true })).toBe(true)
  })

  it('marketing pages always reload', () => {
    expect(shouldReloadNow({ ...base, onAppRoute: false, editing: true })).toBe(true)
  })
})
