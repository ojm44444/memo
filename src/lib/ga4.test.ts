import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GA4 follows the pixel's rules: nothing without the env var, never on
 * token routes, never for someone who opted out or sends GPC, and page
 * addresses keep only utm_* and ref.
 */

const ID = 'G-TEST123'

async function load(opts: { id?: string; path?: string; gpc?: boolean; optedOut?: boolean } = {}) {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  delete window.gtag
  delete window.dataLayer
  document.head.querySelectorAll('script').forEach((s) => s.remove())
  window.history.replaceState(null, '', opts.path ?? '/')
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: opts.gpc ?? false, configurable: true })
  vi.stubEnv('VITE_GA4_MEASUREMENT_ID', opts.id ?? '')
  if (opts.optedOut) localStorage.setItem('songdrafts:ad-consent', 'denied')
  const pixel = await import('@/lib/metaPixel')
  await pixel.resolveConsentRegion()
  const ga = await import('@/lib/ga4')
  ga.initGa4()
  ga.trackGa4PageView()
  vi.advanceTimersByTime(5000)
  return { ga, pixel }
}

function gtagScripts() {
  return [...document.head.querySelectorAll('script')].filter((s) => s.src.includes('googletagmanager'))
}

function events(name: string) {
  return (window.dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === 'event' && args[1] === name)
    .map((args) => args[2] as Record<string, unknown>)
}

describe('GA4', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('does nothing at all without the env var', async () => {
    const { ga } = await load({ id: '' })
    ga.trackGa4SignUp('email')
    ga.trackGa4BeginCheckout('year', 30)
    ga.trackGa4Purchase('cs_1', 30, 'USD', 'year')
    expect(window.gtag).toBeUndefined()
    expect(window.dataLayer).toBeUndefined()
    expect(gtagScripts()).toHaveLength(0)
  })

  it('ignores a malformed id', async () => {
    await load({ id: 'UA-123' })
    expect(gtagScripts()).toHaveLength(0)
  })

  it('loads asynchronously and sends a cleaned page view on the landing page', async () => {
    await load({ id: ID, path: '/?utm_source=reddit&utm_campaign=launch&code=secret&x=1#frag' })
    const scripts = gtagScripts()
    expect(scripts).toHaveLength(1)
    expect(scripts[0].async).toBe(true)
    const views = events('page_view')
    expect(views).toHaveLength(1)
    expect(views[0].page_location).toBe('http://localhost:3000/?utm_source=reddit&utm_campaign=launch')
  })

  for (const path of ['/share/tok123', '/invite/tok123', '/playlist/tok123', '/admin']) {
    it(`never loads or sends on ${path}`, async () => {
      const { ga } = await load({ id: ID, path })
      ga.trackGa4SignUp('google')
      expect(gtagScripts()).toHaveLength(0)
      expect(window.dataLayer).toBeUndefined()
    })
  }

  it('switches itself off before moving to a token route inside the app', async () => {
    const { ga } = await load({ id: ID, path: '/' })
    window.history.pushState(null, '', '/share/tok123')
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(true)
    ga.trackGa4PageView('/share/tok123')
    expect(events('page_view')).toHaveLength(1)
    window.history.pushState(null, '', '/app')
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(false)
  })

  it('respects an opt-out', async () => {
    const { ga } = await load({ id: ID, optedOut: true })
    ga.trackGa4BeginCheckout('year', 30)
    expect(gtagScripts()).toHaveLength(0)
    expect(window.dataLayer).toBeUndefined()
  })

  it('respects Global Privacy Control', async () => {
    await load({ id: ID, gpc: true })
    expect(gtagScripts()).toHaveLength(0)
    expect(window.dataLayer).toBeUndefined()
  })

  it('stops and clears cookies when someone opts out after it loaded', async () => {
    const { ga, pixel } = await load({ id: ID })
    document.cookie = '_ga=GA1.1.123; path=/'
    pixel.setAdConsent('denied')
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(true)
    expect(document.cookie).not.toContain('_ga=')
    ga.trackGa4SignUp('email')
    expect(events('sign_up')).toHaveLength(0)
  })

  it('sends conversions with first-touch tags, and a purchase only once', async () => {
    const { ga } = await load({ id: ID })
    localStorage.setItem(
      'sd_first_touch',
      JSON.stringify({ utm_source: 'reddit', utm_campaign: 'launch', path: '/', at: 'x' }),
    )
    ga.trackGa4SignUp('google')
    ga.trackGa4BeginCheckout('year', 30)
    ga.trackGa4Purchase('cs_test_1', 30, 'USD', 'year')
    ga.trackGa4Purchase('cs_test_1', 30, 'USD', 'year')
    expect(events('sign_up')[0]).toMatchObject({ method: 'google', first_source_touch: 'reddit' })
    expect(events('begin_checkout')[0]).toMatchObject({ currency: 'USD', value: 30 })
    const purchases = events('purchase')
    expect(purchases).toHaveLength(1)
    expect(purchases[0]).toMatchObject({ transaction_id: 'cs_test_1', value: 30, currency: 'USD' })
  })
})

describe('cleanUrl', () => {
  it('keeps only utm_* and ref, drops the hash', async () => {
    const { cleanUrl } = await import('@/lib/ga4')
    expect(cleanUrl('https://www.songdrafts.com/app?code=abc&session_id=cs_1&ref=r1&utm_medium=post#x')).toBe(
      'https://www.songdrafts.com/app?ref=r1&utm_medium=post',
    )
  })

  it('reduces a token route to the origin', async () => {
    const { cleanUrl } = await import('@/lib/ga4')
    expect(cleanUrl('https://www.songdrafts.com/share/secret?utm_source=x')).toBe('https://www.songdrafts.com/')
  })
})
