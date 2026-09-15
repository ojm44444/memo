import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  dismissConsentQuestion,
  getConsentRegion,
  globalPrivacyControl,
  initPixelFromConsent,
  isAskingAgain,
  isPixelBlockedHere,
  onAdConsentChange,
  resetAdConsent,
  setAdConsent,
  shouldAskForConsent,
  trackPageView,
} from '@/lib/metaPixel'
import '@/styles/ad-consent.css'

/** Re-render whenever consent or the region changes. */
function useConsentState() {
  const [, setTick] = useState(0)
  useEffect(() => onAdConsentChange(() => setTick((n) => n + 1)), [])
}

/**
 * The ads question.
 *
 * UK, EU and anywhere the country is unknown: asked before anything from Meta
 * loads. US: not asked up front (opt-out), but "Your privacy choices" opens
 * this same question at any time. "No thanks" is exactly as easy as "Allow":
 * same size, one tap. Never on share, invite or playlist links.
 */
export function AdConsentBanner() {
  const location = useLocation()
  useConsentState()

  useEffect(() => {
    void initPixelFromConsent()
  }, [])

  if (isPixelBlockedHere(location.pathname)) return null

  // Global Privacy Control is already a no. Say so if they asked.
  if (globalPrivacyControl()) {
    if (!isAskingAgain()) return null
    return (
      <div className="ad-consent" role="dialog" aria-live="polite" aria-label="Ad measurement">
        <p className="ad-consent-text">
          Your browser sends Global Privacy Control, so nothing is shared with Meta.{' '}
          <Link to="/privacy">Details</Link>
        </p>
        <div className="ad-consent-actions">
          <button type="button" className="ad-consent-button" onClick={dismissConsentQuestion}>
            OK
          </button>
        </div>
      </div>
    )
  }

  if (!shouldAskForConsent()) return null

  return (
    <div className="ad-consent" role="dialog" aria-live="polite" aria-label="Ad measurement">
      <p className="ad-consent-text">
        Can we use Meta to see which of our ads work? It sets one cookie and tells Meta you
        visited. Never your music, and never anything in your board.{' '}
        <Link to="/privacy">Details</Link>
      </p>
      <div className="ad-consent-actions">
        <button type="button" className="ad-consent-button" onClick={() => setAdConsent('denied')}>
          No thanks
        </button>
        <button type="button" className="ad-consent-button" onClick={() => setAdConsent('granted')}>
          Allow
        </button>
      </div>
    </div>
  )
}

/** Counts a page view on the public pages when the route changes. */
export function PixelPageViews() {
  const location = useLocation()
  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])
  return null
}

/**
 * Change your mind, as easily as the first time. Named for what US law calls
 * it where the US rules apply, "Cookie settings" everywhere else.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  useConsentState()
  return (
    <button type="button" className={className ?? 'cookie-settings-link'} onClick={resetAdConsent}>
      {getConsentRegion() === 'optout' ? 'Your privacy choices' : 'Cookie settings'}
    </button>
  )
}
