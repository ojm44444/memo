import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Consent option B, decided 15 Sept: the UK, EU and anywhere unknown are
 * asked before anything loads; the US is opt-out; Global Privacy Control is
 * a no everywhere. These are the rules the banner and the checkout both read.
 */

async function freshModule(country: string | null | 'error', gpc = false) {
  vi.resetModules()
  sessionStorage.clear()
  localStorage.clear()
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: gpc, configurable: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (country === 'error') throw new Error('offline')
      return new Response(JSON.stringify({ country }), { status: 200 })
    }),
  )
  const mod = await import('@/lib/metaPixel')
  await mod.resolveConsentRegion()
  return mod
}

describe('ad consent by region', () => {
  beforeEach(() => {
    delete (window as { fbq?: unknown }).fbq
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks in the UK before anything applies', async () => {
    const m = await freshModule('GB')
    expect(m.effectiveAdConsent()).toBeNull()
    expect(m.shouldAskForConsent()).toBe(true)
    expect(m.adConsentForCheckout()).toEqual({ adConsent: false })
  })

  it('asks in the EU', async () => {
    const m = await freshModule('DE')
    expect(m.shouldAskForConsent()).toBe(true)
  })

  it('asks when the country is missing or the lookup fails, never assumes the US', async () => {
    expect((await freshModule(null)).shouldAskForConsent()).toBe(true)
    expect((await freshModule('error')).shouldAskForConsent()).toBe(true)
  })

  it('does not ask up front in the US, and counts as yes until they opt out', async () => {
    const m = await freshModule('US')
    expect(m.shouldAskForConsent()).toBe(false)
    expect(m.effectiveAdConsent()).toBe('granted')
    expect(m.adConsentForCheckout().adConsent).toBe(true)
  })

  it('US: "Your privacy choices" asks, and No thanks is an opt-out that sticks', async () => {
    const m = await freshModule('US')
    m.resetAdConsent()
    expect(m.shouldAskForConsent()).toBe(true)
    m.setAdConsent('denied')
    expect(m.shouldAskForConsent()).toBe(false)
    expect(m.effectiveAdConsent()).toBe('denied')
    expect(m.adConsentForCheckout()).toEqual({ adConsent: false })
  })

  it('opening the question and walking away changes nothing', async () => {
    const m = await freshModule('GB')
    m.setAdConsent('granted')
    m.resetAdConsent()
    expect(m.effectiveAdConsent()).toBe('granted')
  })

  it('Global Privacy Control is a no everywhere, even after an earlier Allow', async () => {
    const us = await freshModule('US', true)
    expect(us.effectiveAdConsent()).toBe('denied')
    expect(us.shouldAskForConsent()).toBe(false)
    expect(us.adConsentForCheckout()).toEqual({ adConsent: false })

    const gb = await freshModule('GB', true)
    localStorage.setItem('songdrafts:ad-consent', 'granted')
    expect(gb.effectiveAdConsent()).toBe('denied')
  })
})
