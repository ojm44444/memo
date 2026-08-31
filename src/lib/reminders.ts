import { db } from '@/db/database'
import { getImportWatermark } from '@/db/repositories/integrityRepo'

/**
 * The nudge to go and collect the memos you have recorded since last time.
 *
 * The point is NOT "you have not written today". Nobody needs an app to tell
 * them that, and the research is explicit that this audience already gets told
 * their problem is discipline. During a dry spell or a burnout a scolding
 * reminder is worse than none at all.
 *
 * The point is the watermark: you got up to New Recording 57 on the 9th, so
 * everything above it in Voice Memos is new. That turns a vague guilt trip
 * into a two-minute job with a defined edge, which is the only kind of
 * reminder worth sending. If there is nothing new, it says so and asks for
 * nothing.
 */

export type ReminderFrequency = 'off' | 'weekly' | 'fortnightly' | 'monthly'

/** 0 = Sunday, matching Date#getDay. */
export type ReminderDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ReminderSettings {
  frequency: ReminderFrequency
  /** Which day it lands on. Ignored when frequency is 'off'. */
  day: ReminderDay
  /** Local hour, 0-23. */
  hour: number
}

export const DEFAULT_REMINDER: ReminderSettings = {
  frequency: 'off',
  day: 0, // Sunday, the day Owen described
  hour: 18,
}

const SETTINGS_KEY = 'reminderSettings'
const LAST_FIRED_KEY = 'reminderLastFired'

const FREQUENCY_DAYS: Record<Exclude<ReminderFrequency, 'off'>, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export async function getReminderSettings(): Promise<ReminderSettings> {
  const meta = await db.syncMeta.get(SETTINGS_KEY)
  if (!meta?.value) return DEFAULT_REMINDER
  try {
    const parsed = JSON.parse(meta.value) as Partial<ReminderSettings>
    return {
      frequency: parsed.frequency ?? DEFAULT_REMINDER.frequency,
      day: (parsed.day ?? DEFAULT_REMINDER.day) as ReminderDay,
      hour: typeof parsed.hour === 'number' ? parsed.hour : DEFAULT_REMINDER.hour,
    }
  } catch {
    return DEFAULT_REMINDER
  }
}

export async function setReminderSettings(next: ReminderSettings) {
  await db.syncMeta.put({ key: SETTINGS_KEY, value: JSON.stringify(next) })
}

async function getLastFired(): Promise<number | null> {
  const meta = await db.syncMeta.get(LAST_FIRED_KEY)
  const n = Number(meta?.value)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function setLastFired(at: number) {
  await db.syncMeta.put({ key: LAST_FIRED_KEY, value: String(at) })
}

/**
 * The most recent moment matching the chosen day and hour, at or before `now`.
 *
 * Computed by walking back from `now` rather than forward from an anchor, so
 * it does not care when the setting was made, whether the app was open, or how
 * long it has been closed. Local time throughout: someone asking for Sunday
 * evening means Sunday evening where they are, and a reminder that arrives on
 * Saturday afternoon because it was stored in UTC is a bug they will not
 * report, they will just turn it off.
 */
export function lastScheduledSlot(settings: ReminderSettings, now: Date): Date {
  const slot = new Date(now)
  slot.setHours(settings.hour, 0, 0, 0)
  const daysSince = (slot.getDay() - settings.day + 7) % 7
  slot.setDate(slot.getDate() - daysSince)
  // Landing on today but before the hour means today's slot has not happened.
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 7)
  return slot
}

/**
 * Is a reminder owed?
 *
 * Owed means: a scheduled slot has passed, and we have not fired since the
 * start of this frequency's window. The window check is what stops a
 * fortnightly setting firing on both of the weeks it spans.
 */
export function isReminderDue(
  settings: ReminderSettings,
  lastFired: number | null,
  now: Date,
): boolean {
  if (settings.frequency === 'off') return false
  const slot = lastScheduledSlot(settings, now)
  if (lastFired == null) return true
  const windowMs = FREQUENCY_DAYS[settings.frequency] * 86_400_000
  // Fire only if the last one was before this slot AND a full period has
  // passed. The second half is what makes fortnightly and monthly skip slots
  // rather than firing on every one of them.
  return lastFired < slot.getTime() && now.getTime() - lastFired >= windowMs
}

export interface ReminderMessage {
  title: string
  body: string
}

/**
 * What the reminder actually says, built from the watermark.
 *
 * Deliberately never scolds and never counts what you have not done. It states
 * where you got to and leaves the decision alone.
 */
export async function buildReminderMessage(now = new Date()): Promise<ReminderMessage> {
  const watermark = await getImportWatermark()

  if (!watermark) {
    return {
      title: 'Bring your voice memos over',
      body: 'Nothing imported yet. Whatever is sitting in Voice Memos, this is where it goes.',
    }
  }

  const recorded = new Date(watermark.recordedAt)
  const days = Math.floor((now.getTime() - recorded.getTime()) / 86_400_000)
  const when =
    days <= 0
      ? 'today'
      : days === 1
        ? 'yesterday'
        : days < 30
          ? `${days} days ago`
          : recorded.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

  return {
    title: 'Anything new since last time?',
    body:
      `You got up to "${watermark.title}", recorded ${when}. ` +
      `Scroll to it in Voice Memos and bring over everything above it.`,
  }
}

/** Has the person granted notification permission? */
export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Fire the reminder if one is owed. Called on boot.
 *
 * HONEST LIMIT, and it is the reason this is worth stating in the UI rather
 * than hiding: with no server, a web app cannot wake itself on a Sunday to
 * notify you. This fires when the app is next opened after a missed slot,
 * which makes it a catch-up rather than an alarm clock. Real
 * arrives-on-Sunday-whether-you-open-it-or-not delivery needs a backend
 * sending push or email, which is a separate job.
 */
export async function fireReminderIfDue(now = new Date()): Promise<ReminderMessage | null> {
  const settings = await getReminderSettings()
  if (settings.frequency === 'off') return null

  const lastFired = await getLastFired()
  if (!isReminderDue(settings, lastFired, now)) return null
  if (!canNotify()) return null

  const message = await buildReminderMessage(now)
  try {
    new Notification(message.title, {
      body: message.body,
      icon: '/brand/icon.svg',
      tag: 'songdrafts-import-reminder',
    })
  } catch {
    // Some browsers refuse a bare Notification outside a service worker. A
    // reminder that cannot be shown must not be marked as fired, or the person
    // silently loses that period's nudge.
    return null
  }

  await setLastFired(now.getTime())
  return message
}
