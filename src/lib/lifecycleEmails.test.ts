import { describe, expect, it } from 'vitest'
import * as emails from '../../supabase/functions/_shared/emails'

/**
 * The lifecycle emails, held to what the code actually does.
 *
 * Every assertion here is a sentence that was in a draft and would have gone
 * out false the moment Resend was switched on. See the CHECKED AGAINST THE
 * CODE note in emails.ts for how each one was verified.
 */

const all = [
  emails.welcomeEmail('Sam'),
  emails.stalledImportEmail('Sam'),
  emails.trialEndingEmail('Sam', '14 October 2026', '$49', 'year'),
  emails.paymentFailedEmail('Sam'),
  emails.cancelledEmail('Sam', '14 October 2026'),
  emails.audioExpiring60Email('Sam', '14 October 2026'),
  emails.audioExpiring85Email('Sam', '14 October 2026'),
  emails.audioDeletedEmail('Sam'),
]

describe('lifecycle emails', () => {
  it('never present the business as one person', () => {
    for (const e of all) {
      expect(e.text).not.toMatch(/\bOwen\b/)
      expect(e.text).not.toMatch(/\bI\b|\bme\b|\bmy\b/)
      expect(e.text).toMatch(/The songdrafts team$/)
    }
  })

  it('contain no em dashes', () => {
    for (const e of all) expect(e.subject + e.text).not.toContain('\u2014')
  })

  it('never tell anyone to share memos to songdrafts (there is no share target)', () => {
    for (const e of all) expect(e.text).not.toMatch(/share[^.]*to songdrafts|pick songdrafts/i)
  })

  it('never tell anyone to drag out of the Voice Memos app (the board rejects it)', () => {
    for (const e of all) expect(e.text).not.toMatch(/Voice Memos app[^.]*drag/i)
  })

  it('always say to Download all audio before a backup, or the ZIP can be missing audio', () => {
    const mentionsBackup = all.filter((x) => /\bexport\b|backup/i.test(x.text))
    // Guard against this test passing by checking nothing at all.
    expect(mentionsBackup.length).toBeGreaterThanOrEqual(3)
    for (const e of mentionsBackup) expect(e.text).toMatch(/Download all audio/)
  })

  it('never claim a device already has every recording, or that resubscribing re-uploads', () => {
    for (const e of all) {
      expect(e.text).not.toMatch(/recordings are already there/i)
      expect(e.text).not.toMatch(/puts them back in the cloud/i)
    }
  })

  it('state the trial charge: amount, date, and that it is automatic', () => {
    const t = emails.trialEndingEmail('Sam', '14 October 2026', '£41', 'month')
    expect(t.text).toContain('£41')
    expect(t.text).toContain('14 October 2026')
    expect(t.text).toMatch(/automatically/)
    expect(t.text).toMatch(/every month/)
    expect(t.text).not.toMatch(/Nothing happens without/)
  })
})
