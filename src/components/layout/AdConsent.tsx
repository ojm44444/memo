import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getAdConsent,
  initPixelFromStoredConsent,
  isPixelBlockedHere,
  onAdConsentChange,
  resetAdConsent,
  setAdConsent,
  trackPageView,
  type AdConsent,
} from '@/lib/metaPixel'
import '@/styles/ad-consent.css'

/**
 * Asks once, before anything from Meta loads.
 *
 * "No thanks" is exactly as easy as "Allow": same size, same weight, one tap.
 * The ICO's guidance is that a refusal buried behind a settings screen is not
 * a real choice. It never appears on share, invite or playlist links, where
 * the pixel is not allowed to run at all.
 */
export function AdConsentBanner() {
  const location = useLocation()
  const [consent, setConsent] = useState<AdConsent | null>(() => getAdConsent())

  useEffect(() => {
    initPixelFromStoredConsent()
    return onAdConsentChange(setConsent)
  }, [])

  if (consent !== null || isPixelBlockedHere(location.pathname)) return null

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

/** Lets someone change their mind, which the law requires to be as easy. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className ?? 'cookie-settings-link'} onClick={resetAdConsent}>
      Cookie settings
    </button>
  )
}
