import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from './friendlyAuthError'

describe('friendlyAuthError', () => {
  it('never shows a customer the default-SMTP infrastructure message', () => {
    const raw = {
      code: 'email_address_not_authorized',
      message:
        'Email sending is not allowed for this address as your project is using the default SMTP service.',
    }
    const shown = friendlyAuthError(raw, { googleAvailable: true })
    expect(shown).not.toMatch(/SMTP|project|organization/i)
    expect(shown).toMatch(/Google/)
  })

  it('does not point to Google where there is no Google button', () => {
    const shown = friendlyAuthError({ code: 'email_address_not_authorized' }, { googleAvailable: false })
    expect(shown).not.toMatch(/Google/)
  })

  it('turns the rate limit into something to do', () => {
    expect(friendlyAuthError({ code: 'over_email_send_rate_limit' }, { googleAvailable: true })).toMatch(/wait a minute/i)
  })

  it('falls back to the original message for anything else', () => {
    expect(friendlyAuthError({ code: 'weird', message: 'Something specific' }, { googleAvailable: true })).toBe('Something specific')
  })
})
