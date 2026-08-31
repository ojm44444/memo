import { describe, expect, it } from 'vitest'
import {
  isReminderDue,
  lastScheduledSlot,
  type ReminderSettings,
} from './reminders'

/** Sunday 18:00 local, the shape Owen described. */
const SUNDAY_6PM: ReminderSettings = { frequency: 'weekly', day: 0, hour: 18 }

const at = (iso: string) => new Date(iso)

describe('lastScheduledSlot', () => {
  it('walks back to the most recent matching day and hour', () => {
    // Wednesday 3 Jun 2026, 09:00 -> the Sunday before, at 18:00
    const slot = lastScheduledSlot(SUNDAY_6PM, at('2026-06-03T09:00:00'))
    expect(slot.getDay()).toBe(0)
    expect(slot.getHours()).toBe(18)
    expect(slot.getDate()).toBe(31) // Sun 31 May
  })

  it('does not count today when the hour has not arrived yet', () => {
    // Sunday 17:00 - today's 18:00 slot has not happened, so it is last week's
    const slot = lastScheduledSlot(SUNDAY_6PM, at('2026-06-07T17:00:00'))
    expect(slot.getDate()).toBe(31)
  })

  it('counts today once the hour has passed', () => {
    const slot = lastScheduledSlot(SUNDAY_6PM, at('2026-06-07T18:30:00'))
    expect(slot.getDate()).toBe(7)
  })
})

describe('isReminderDue', () => {
  it('is never due when the schedule is off', () => {
    const off: ReminderSettings = { ...SUNDAY_6PM, frequency: 'off' }
    expect(isReminderDue(off, null, at('2026-06-07T19:00:00'))).toBe(false)
  })

  it('is due the first time, with nothing fired yet', () => {
    expect(isReminderDue(SUNDAY_6PM, null, at('2026-06-07T19:00:00'))).toBe(true)
  })

  it('does not fire twice in the same week', () => {
    const fired = at('2026-06-07T18:05:00').getTime()
    expect(isReminderDue(SUNDAY_6PM, fired, at('2026-06-09T10:00:00'))).toBe(false)
  })

  it('fires again the following week', () => {
    const fired = at('2026-06-07T18:05:00').getTime()
    expect(isReminderDue(SUNDAY_6PM, fired, at('2026-06-14T19:00:00'))).toBe(true)
  })

  it('catches up after the app was closed for a month', () => {
    const fired = at('2026-05-03T18:05:00').getTime()
    expect(isReminderDue(SUNDAY_6PM, fired, at('2026-06-09T11:00:00'))).toBe(true)
  })

  it('fortnightly skips the intervening Sunday', () => {
    const fortnightly: ReminderSettings = { ...SUNDAY_6PM, frequency: 'fortnightly' }
    const fired = at('2026-06-07T18:05:00').getTime()
    // One week later: a slot has passed, but the period has not.
    expect(isReminderDue(fortnightly, fired, at('2026-06-14T19:00:00'))).toBe(false)
    // Two weeks later: due.
    expect(isReminderDue(fortnightly, fired, at('2026-06-21T19:00:00'))).toBe(true)
  })

  it('monthly waits four weeks, not four Sundays', () => {
    const monthly: ReminderSettings = { ...SUNDAY_6PM, frequency: 'monthly' }
    const fired = at('2026-06-07T18:05:00').getTime()
    expect(isReminderDue(monthly, fired, at('2026-06-28T19:00:00'))).toBe(false)
    expect(isReminderDue(monthly, fired, at('2026-07-05T19:00:00'))).toBe(true)
  })
})
