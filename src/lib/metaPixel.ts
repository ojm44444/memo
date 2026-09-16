/**
 * The Meta pixel, only with permission, and only where it is safe.
 *
 * Added 14 Sept 2026 at Owen's request so ads can be measured. Four rules,
 * each one a thing that would otherwise have gone wrong:
 *
 *  1. NOTHING LOADS UNTIL SOMEONE SAYS YES. The pixel sets Meta's _fbp cookie
 *     and tells Meta which pages were visited, which UK and EU law (PECR, with
 *     GDPR) treats as needing consent first. Until "Allow" is pressed the
 *     script is never even requested. The privacy page used to say there were
 *     no trackers and that this was why the site never showed a consent
 *     banner; it now says what this does, and the banner is the consent.
 *
 *  2. NEVER ON SHARE, INVITE OR PLAYLIST LINKS. A pixel reports the page URL,
 *     and those URLs carry the secret token that opens someone's unreleased
 *     music. Sending them to Meta would hand over the key. The people opening
 *     them are also a producer or a bandmate who never agreed to anything.
 *
 *  3. NO PAGE VIEWS INSIDE THE APP. The board's tab title is now the name of
 *     the open song, and what someone is working on is not Meta's business.
 *     The app sends only the named conversion events below, with no content.
 *
 *  4. META'S AUTOMATIC SCRAPING IS OFF. By default the pixel reads button text
 *     and page metadata by itself ("automatic events"). autoConfig false
 *     stops that, so Meta receives exactly the events listed here and nothing
 *     it decided to collect on its own.
 *
 *  5. WHO IS ASKED FIRST DEPENDS ON WHERE THEY ARE (consent option B, 15
 *     Sept). UK, EU and everywhere else: nothing loads until Allow. The US
 *     works on opting out: the pixel runs unless the visitor opts out through
 *     "Your privacy choices" or their browser sends Global Privacy Control.
 *     If the country cannot be read, the visitor is asked, never assumed to
 *     be in the US. GPC is a no everywhere, whatever else was chosen.
 *
 * What is sent: PageView on the public pages, CompleteRegistration,
 * ImportStarted, ImportCompleted, InitiateCheckout, Purchase. Never a song
 * title, a file name, lyrics, an email address, or anything from a board.
 */

export const META_PIXEL_ID = '1609391504053938'

const CONSENT_KEY = 'songdrafts:ad-consent'
const REGION_KEY = 'songdrafts:consent-region'

export type AdConsent = 'granted' | 'denied'

/**
 * 'optout': the US, where the pixel may run until someone opts out.
 * 'ask': everywhere else, and anywhere the country is unknown.
 */
export type ConsentRegion = 'optout' | 'ask'

let region: ConsentRegion | null = null
/** Set by "Your privacy choices" / "Cookie settings": show the question now. */
let askingAgain = false

/** Routes the pixel must never run on, whatever the visitor chose. */
const NEVER_ON = [/^\/share\//, /^\/invite\//, /^\/playlist\//, /^\/admin(\/|$)/]

/** Public pages where a page view is counted. Everything else is private. */
/* 17 Sept, Owen: the pixel on every part of the site, so the app counts
   too (path only, nothing from the board). Share, playlist and invite links
   stay off: their URLs carry private tokens. */
const PAGE_VIEW_ROUTES = [
  /^\/$/,
  /^\/sign-in\/?$/,
  /^\/sign-up\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
  /^\/app(\/|$)/,
]

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue: unknown[]
  push: unknown
  loaded: boolean
  version: string
  disablePushState?: boolean
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

const listeners = new Set<(consent: AdConsent | null) => void>()

export function isPixelBlockedHere(pathname: string = window.location.pathname): boolean {
  return NEVER_ON.some((pattern) => pattern.test(pathname))
}

export function getAdConsent(): AdConsent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    // Storage blocked (some private modes): treat as "not asked", never as yes.
    return null
  }
}

export function onAdConsentChange(listener: (consent: AdConsent | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(consent: AdConsent | null) {
  for (const listener of listeners) listener(consent)
}

export function getConsentRegion(): ConsentRegion | null {
  return region
}

/**
 * Where the visitor is, as far as consent goes. Read once per tab from the
 * site's own edge endpoint (/api/geo). Anything but a clear "US" is 'ask',
 * including a timeout, an error, or no answer: the banner is the safe side.
 */
export async function resolveConsentRegion(): Promise<ConsentRegion> {
  /* 17 Sept 2026, Owen's decision, made after being told it goes against the
     UK/EU cookie rules (consent before loading): the pixel runs for everyone
     by default with no banner. Opting out stays one tap away (Your privacy
     choices), and Global Privacy Control still counts as a no. To go back to
     asking outside the US, restore the /api/geo lookup from git history. */
  region = 'optout'
  try {
    sessionStorage.setItem(REGION_KEY, region)
  } catch {
    /* nothing to remember */
  }
  return region
}

/**
 * The consent that actually applies right now. GPC says no, always. Then an
 * explicit choice on this device. Then the region's default: yes in the US
 * (opt-out), not yet anywhere else (null means ask).
 */
export function effectiveAdConsent(): AdConsent | null {
  if (globalPrivacyControl()) return 'denied'
  const stored = getAdConsent()
  if (stored) return stored
  if (region === 'optout') return 'granted'
  return null
}

/** Did someone just open "Cookie settings" / "Your privacy choices"? */
export function isAskingAgain(): boolean {
  return askingAgain
}

/** Close the question without changing anything (the GPC notice). */
export function dismissConsentQuestion() {
  askingAgain = false
  notify(effectiveAdConsent())
}

/** Should the question be on screen? */
export function shouldAskForConsent(): boolean {
  if (globalPrivacyControl()) return false
  if (askingAgain) return true
  if (region === null) return false // not known yet: wait rather than flash
  return effectiveAdConsent() === null
}

/** The standard Meta loader, run only after consent. */
function loadPixel() {
  if (typeof window === 'undefined' || window.fbq) return
  if (isPixelBlockedHere()) return

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  } as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  /* Meta's pixel listens to the History API and sends a PageView by itself
     whenever a single-page app changes URL. Left on, someone who allowed it
     on the home page and then moved inside the app to a /share/<token> URL
     would have that token sent to Meta, which is the exact leak rule 2 is
     there to stop. Off: page views are only ever the ones trackPageView
     sends, and it sends none outside the public pages. */
  fbq.disablePushState = true
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  // Before init, or Meta starts collecting on its own (rule 4).
  fbq('set', 'autoConfig', false, META_PIXEL_ID)
  fbq('consent', 'grant')
  fbq('init', META_PIXEL_ID)
}

/** Remove Meta's cookies when someone says no after having said yes. */
function clearMetaCookies() {
  for (const name of ['_fbp', '_fbc']) {
    const host = window.location.hostname
    const domains = ['', host, `.${host.replace(/^www\./, '')}`]
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
    }
  }
}

export function setAdConsent(consent: AdConsent) {
  askingAgain = false
  try {
    localStorage.setItem(CONSENT_KEY, consent)
  } catch {
    /* choice still applies for this page view */
  }
  if (consent === 'granted') {
    loadPixel()
    trackPageView(window.location.pathname)
  } else {
    // The script cannot be unloaded, but it can be told to stop sending.
    window.fbq?.('consent', 'revoke')
    clearMetaCookies()
  }
  notify(consent)
}

/**
 * "Cookie settings" / "Your privacy choices": put the question back on
 * screen. The current choice stays in force until they answer, so opening
 * it and walking away changes nothing.
 */
export function resetAdConsent() {
  askingAgain = true
  notify(effectiveAdConsent())
}

/**
 * On start-up: work out the region, then load only if consent applies (an
 * earlier yes on this device, or a US visitor who has not opted out).
 */
export async function initPixelFromConsent() {
  await resolveConsentRegion()
  if (effectiveAdConsent() === 'granted') {
    loadPixel()
    trackPageView(window.location.pathname)
  }
  notify(effectiveAdConsent())
}

function canSend(): boolean {
  return effectiveAdConsent() === 'granted' && !isPixelBlockedHere() && typeof window.fbq === 'function'
}

export function trackPageView(pathname: string) {
  if (!PAGE_VIEW_ROUTES.some((pattern) => pattern.test(pathname))) return
  // The pixel reports the full URL. A sign-in lands on /app?code=... and
  // that code must never reach Meta, so any URL with a query or hash is skipped.
  if (window.location.search || window.location.hash) return
  if (!canSend()) return
  window.fbq!('track', 'PageView')
}

type StandardEvent = 'CompleteRegistration' | 'InitiateCheckout' | 'Purchase'
type CustomEvent = 'ImportStarted' | 'ImportCompleted'

/**
 * `eventID` lets the server-side Conversions API send the same event later
 * without Meta counting it twice.
 */
export function trackPixelEvent(
  name: StandardEvent,
  params?: Record<string, string | number>,
  eventID?: string,
) {
  if (!canSend()) return
  window.fbq!('track', name, params ?? {}, eventID ? { eventID } : undefined)
}

export function trackPixelCustomEvent(name: CustomEvent, params?: Record<string, string | number>) {
  if (!canSend()) return
  window.fbq!('trackCustom', name, params ?? {})
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * What checkout needs to know about ads measurement for this purchase: did
 * this person allow it, and the browser ids that let Meta match the server's
 * copy of the Purchase to the pixel's. Nothing but a no for anyone who has
 * not said yes, or whose browser sends Global Privacy Control.
 */
export function adConsentForCheckout(): { adConsent: boolean; fbp?: string; fbc?: string } {
  if (effectiveAdConsent() !== 'granted') return { adConsent: false }
  return {
    adConsent: true,
    fbp: readCookie('_fbp') ?? undefined,
    fbc: readCookie('_fbc') ?? undefined,
  }
}

/** Global Privacy Control: the browser saying "do not sell or share". */
export function globalPrivacyControl(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  } catch {
    return false
  }
}
