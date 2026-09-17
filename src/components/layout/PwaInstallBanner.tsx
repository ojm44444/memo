import { useState } from 'react'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { PhoneInstallGuide } from './PhoneInstallGuide'

const DISMISS_KEY = 'memo_pwa_install_dismiss'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone
}

/* Any iPhone browser, not just Safari: Chrome on iPhone can add to the home
   screen too (iOS 16.4+), and that is what Owen uses. */
function isIosBrowser() {
  return isIos()
}

export function PwaInstallBanner() {
  const { canInstall, isInstalled, install } = usePwaInstall()
  const [guide, setGuide] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  )

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (isInstalled || dismissed) return null

  // iOS Safari: show manual "Add to Home Screen" instructions
  // Inside the app only: the guide uses the app's sheet styles.
  if (isIosBrowser() && window.location.pathname.startsWith('/app')) {
    return (
      <>
        <div className="pwa-install-banner" role="status">
          <span>Put songdrafts on your home screen so it opens like an app.</span>
          <button type="button" className="pwa-install-btn" onClick={() => setGuide(true)}>
            Show me how
          </button>
          <button type="button" className="pwa-install-dismiss" onClick={dismiss} aria-label="Not now">
            ✕
          </button>
        </div>
        {guide && <PhoneInstallGuide onClose={() => setGuide(false)} />}
      </>
    )
  }

  // Android / Chrome: native install prompt
  if (!canInstall) return null

  return (
    <div className="pwa-install-banner" role="status">
      <span>
        Add songdrafts to your home screen so the board opens like an app and works offline.
      </span>
      <button type="button" className="pwa-install-btn" onClick={() => void install()}>
        Install
      </button>
      <button type="button" className="pwa-install-dismiss" onClick={dismiss}>
        Not now
      </button>
    </div>
  )
}
