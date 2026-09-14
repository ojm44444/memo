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
 * What is sent: PageView on the public pages, CompleteRegistration,
 * ImportStarted, ImportCompleted, InitiateCheckout, Subscribe. Never a song
 * title, a file name, lyrics, an email address, or anything from a board.
 */

export const META_PIXEL_ID = '1609391504053938'

const CONSENT_KEY = 'songdrafts:ad-consent'

export type AdConsent = 'granted' | 'denied'

/** Routes the pixel must never run on, whatever the visitor chose. */
const NEVER_ON = [/^\/share\//, /^\/invite\//, /^\/playlist\//, /^\/admin(\/|$)/]

/** Public pages where a page view is counted. Everything else is private. */
const PAGE_VIEW_ROUTES = [/^\/$/, /^\/sign-in\/?$/, /^\/privacy\/?$/, /^\/terms\/?$/]

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

/** "Cookie settings": forget the choice so the banner asks again. */
export function resetAdConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    /* nothing stored */
  }
  window.fbq?.('consent', 'revoke')
  notify(null)
}

/** Load on start-up only for someone who already said yes on this device. */
export function initPixelFromStoredConsent() {
  if (getAdConsent() === 'granted') loadPixel()
}

function canSend(): boolean {
  return getAdConsent() === 'granted' && !isPixelBlockedHere() && typeof window.fbq === 'function'
}

export function trackPageView(pathname: string) {
  if (!PAGE_VIEW_ROUTES.some((pattern) => pattern.test(pathname))) return
  if (!canSend()) return
  window.fbq!('track', 'PageView')
}

type StandardEvent = 'CompleteRegistration' | 'InitiateCheckout' | 'Subscribe'
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
