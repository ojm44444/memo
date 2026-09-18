/**
 * Google Analytics 4 (Owen, 18 Sept 2026): visitors, where they came from
 * (Reddit first), sign-ups and purchases.
 *
 * Switched on by one env var, VITE_GA4_MEASUREMENT_ID (G-XXXXXXX). Without it
 * nothing loads and every call below does nothing.
 *
 * Same privacy rules as the Meta pixel (metaPixel.ts), and the same switch:
 *
 *  1. SAME CONSENT. On by default, off through "Your privacy choices", and
 *     Global Privacy Control is always a no. If it is a no, gtag.js is never
 *     requested. A no after a yes switches it off and removes the _ga cookies.
 *
 *  2. NEVER ON SHARE, INVITE OR PLAYLIST LINKS, or any page not on the short
 *     list below. Those URLs carry the token that opens someone's music.
 *     gtag.js is not loaded there, and if the visitor moves there inside the
 *     app, Google's own off switch (window['ga-disable-G-...']) is set before
 *     the URL changes, so nothing is sent from that page, automatic or not.
 *
 *  3. ADDRESSES ARE CLEANED. Every page address sent keeps only utm_* and ref
 *     from the query and drops the hash, so a sign-in code or a Stripe session
 *     id never reaches Google. The referrer is cleaned the same way.
 *
 *  4. PAGE VIEWS ARE OURS. send_page_view is off and page_view is sent here on
 *     each route change, so only allowed pages are counted.
 *
 *  5. NEVER SLOWS THE LANDING PAGE. The script is added after the page has
 *     loaded and the browser is idle, async, never from index.html.
 *
 * What is sent: page_view, sign_up, begin_checkout, purchase, plus the first
 * campaign tags this browser arrived with. Never a song, a file name, lyrics,
 * an email address, or anything from a board.
 */

import { getFirstTouch, getHeardFrom } from '@/lib/attribution'
import { effectiveAdConsent, onAdConsentChange } from '@/lib/metaPixel'

type Gtag = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
  }
}

/** Pages GA4 may run on. Everything else is off. */
const ALLOWED_ROUTES = [
  /^\/$/,
  /^\/sign-in\/?$/,
  /^\/sign-up\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
  /^\/app(\/|$)/,
]

/** Belt and braces: these are never allowed, whatever the list above says. */
const NEVER_ON = [/^\/share\//, /^\/invite\//, /^\/playlist\//, /^\/admin(\/|$)/]

const KEEP_PARAM = /^(utm_[a-z_]+|ref)$/

export function measurementId(): string | null {
  const id = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined)?.trim()
  return id && /^G-[A-Z0-9]+$/.test(id) ? id : null
}

export function isGa4AllowedHere(pathname: string = window.location.pathname): boolean {
  if (NEVER_ON.some((pattern) => pattern.test(pathname))) return false
  return ALLOWED_ROUTES.some((pattern) => pattern.test(pathname))
}

/** Keep only utm_* and ref, drop the hash. Returns null if it cannot parse. */
export function cleanUrl(href: string): string | null {
  try {
    const url = new URL(href)
    if (!isGa4AllowedHere(url.pathname)) return url.origin + '/'
    const kept = new URLSearchParams()
    url.searchParams.forEach((value, key) => {
      if (KEEP_PARAM.test(key)) kept.append(key, value)
    })
    const query = kept.toString()
    return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`
  } catch {
    return null
  }
}

/** Another site: its origin only. This site: the cleaned address. */
function cleanReferrer(referrer: string): string | undefined {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    if (url.origin !== window.location.origin) return url.origin + '/'
    return cleanUrl(referrer) ?? undefined
  } catch {
    return undefined
  }
}

function consentAllows(): boolean {
  return effectiveAdConsent() === 'granted'
}

let started = false
let scriptQueued = false
let historyGuarded = false

function disableFlag(id: string): string {
  return `ga-disable-${id}`
}

/** Google's documented off switch, checked by gtag.js before every hit. */
function setDisabled(id: string, disabled: boolean) {
  ;(window as unknown as Record<string, unknown>)[disableFlag(id)] = disabled
}

function refreshDisabled(pathname: string = window.location.pathname) {
  const id = measurementId()
  if (!id) return
  setDisabled(id, !consentAllows() || !isGa4AllowedHere(pathname))
}

/**
 * Set the off switch before the URL changes, not after React renders, so
 * gtag.js's own history listener (enhanced measurement) never reports a
 * token page. Installed before gtag.js loads, so it runs first.
 */
function guardHistory() {
  if (historyGuarded) return
  historyGuarded = true
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history)
    window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url != null) {
        try {
          refreshDisabled(new URL(String(url), window.location.href).pathname)
        } catch {
          /* leave it as it was */
        }
      }
      original(data, unused, url)
    }
  }
  window.addEventListener('popstate', () => refreshDisabled())
}

function firstTouchUserProperties(): Record<string, string> {
  const touch = getFirstTouch()
  if (!touch) return {}
  // GA4 user property values are capped at 36 characters.
  const props: Record<string, string> = {}
  const add = (key: string, value?: string) => {
    if (value) props[key] = value.slice(0, 36)
  }
  add('first_source', touch.utm_source ?? touch.ref ?? touch.referrer)
  add('first_medium', touch.utm_medium)
  add('first_campaign', touch.utm_campaign)
  add('first_content', touch.utm_content)
  add('first_ref', touch.ref)
  return props
}

/** The same first touch, as event params on the conversions. */
function firstTouchParams(): Record<string, string> {
  const props = firstTouchUserProperties()
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) params[`${key}_touch`] = value
  return params
}

function loadScript(id: string) {
  if (scriptQueued) return
  scriptQueued = true
  const inject = () => {
    // Checked again at the last moment: they may have opted out meanwhile.
    if (!consentAllows() || !isGa4AllowedHere()) {
      scriptQueued = false
      return
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(script)
  }
  const whenIdle = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback
    if (ric) ric(inject, { timeout: 4000 })
    else window.setTimeout(inject, 1500)
  }
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
}

/**
 * Get gtag ready if everything allows it. The queue exists at once, so
 * events sent before the script arrives are kept and sent when it loads.
 */
function ensureStarted(): boolean {
  const id = measurementId()
  if (!id || typeof window === 'undefined') return false
  if (!consentAllows() || !isGa4AllowedHere()) return false
  if (started) {
    loadScript(id)
    return true
  }
  started = true

  guardHistory()
  setDisabled(id, false)
  window.dataLayer = window.dataLayer ?? []
  window.gtag =
    window.gtag ??
    function gtag() {
      // gtag.js reads the arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
  const gtag = window.gtag
  gtag('js', new Date())
  gtag('config', id, {
    send_page_view: false,
    page_location: cleanUrl(window.location.href) ?? undefined,
    page_referrer: cleanReferrer(document.referrer),
    // The board's tab title is the open song's name. Google never gets it.
    page_title: 'songdrafts',
  })
  const props = firstTouchUserProperties()
  if (Object.keys(props).length) gtag('set', 'user_properties', props)
  loadScript(id)
  return true
}

function clearGaCookies() {
  const host = window.location.hostname
  const domains = ['', host, `.${host.replace(/^www\./, '')}`]
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (!name || !/^_ga(_|$)/.test(name)) continue
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
    }
  }
}

let consentWatched = false

/** On start-up, after the pixel has worked out consent. Safe to call twice. */
export function initGa4() {
  if (!measurementId()) return
  if (!consentWatched) {
    consentWatched = true
    onAdConsentChange((consent) => {
      const id = measurementId()
      if (!id) return
      if (consent === 'granted' && consentAllows()) {
        if (ensureStarted()) {
          refreshDisabled()
          trackGa4PageView(window.location.pathname)
        }
      } else {
        setDisabled(id, true)
        clearGaCookies()
      }
    })
  }
  ensureStarted()
}

function send(name: string, params: Record<string, unknown>): void {
  if (!ensureStarted()) return
  const id = measurementId()!
  refreshDisabled()
  if ((window as unknown as Record<string, unknown>)[disableFlag(id)] === true) return
  window.gtag?.('event', name, { ...params, send_to: id })
}

let lastPageView = ''

/** A page view for an allowed page, with a cleaned address. */
export function trackGa4PageView(pathname: string = window.location.pathname) {
  if (!isGa4AllowedHere(pathname)) {
    refreshDisabled(pathname)
    return
  }
  const location = cleanUrl(window.location.href)
  if (!location || location === lastPageView) return
  lastPageView = location
  send('page_view', {
    page_location: location,
    page_path: pathname,
    page_title: 'songdrafts',
  })
}

export function trackGa4SignUp(method: 'google' | 'email') {
  const heard = getHeardFrom()
  send('sign_up', { method, ...firstTouchParams(), ...(heard ? { heard_from: heard.source } : {}) })
}

export function trackGa4BeginCheckout(plan: string, value: number, currency = 'USD') {
  send('begin_checkout', {
    currency,
    value,
    items: [{ item_id: plan, item_name: `songdrafts ${plan}`, price: value, quantity: 1 }],
    ...firstTouchParams(),
  })
}

const PURCHASES_KEY = 'songdrafts:ga4-purchases-sent'

export function trackGa4Purchase(transactionId: string, value: number, currency: string, plan: string) {
  // Once per checkout, even if the receipt is somehow read twice.
  try {
    const sent = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? '[]') as string[]
    if (sent.includes(transactionId)) return
    if (!ensureStarted()) return
    localStorage.setItem(PURCHASES_KEY, JSON.stringify([...sent, transactionId].slice(-20)))
  } catch {
    /* storage blocked: the query was already removed, so a refresh cannot resend */
  }
  send('purchase', {
    transaction_id: transactionId,
    value,
    currency,
    items: [{ item_id: plan, item_name: `songdrafts ${plan}`, price: value, quantity: 1 }],
    ...firstTouchParams(),
  })
}

/** For tests only. */
export function __resetGa4ForTests() {
  started = false
  scriptQueued = false
  consentWatched = false
  lastPageView = ''
}
