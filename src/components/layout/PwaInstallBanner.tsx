import { useState } from 'react'
import { usePwaInstall } from '@/hooks/usePwaInstall'

const DISMISS_KEY = 'memo_pwa_install_dismiss'

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone
}

function isIosSafari() {
  return isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

export function PwaInstallBanner() {
  const { canInstall, isInstalled, install } = usePwaInstall()
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  )

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (isInstalled || dismissed) return null

  // iOS Safari: show manual "Add to Home Screen" instructions
  if (isIosSafari()) {
    return (
      <div className="pwa-install-banner" role="status">
        <span>
          Install memo: tap <strong>Share ⬆</strong> in Safari, then <strong>Add to Home Screen</strong>
        </span>
        <button type="button" className="pwa-install-dismiss" onClick={dismiss}>
          ✕
        </button>
      </div>
    )
  }

  // Android / Chrome: native install prompt
  if (!canInstall) return null

  return (
    <div className="pwa-install-banner" role="status">
      <span>
        Install memo for offline access and Share → memo from Voice Memos.
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
