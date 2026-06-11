import { useState } from 'react'
import { usePwaInstall } from '@/hooks/usePwaInstall'

const DISMISS_KEY = 'memo_pwa_install_dismiss'

export function PwaInstallBanner() {
  const { canInstall, isInstalled, install } = usePwaInstall()
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  )

  if (!canInstall || isInstalled || dismissed) return null

  return (
    <div className="pwa-install-banner" role="status">
      <span>
        Install mem• for offline access and Share → mem• from Voice Memos.
      </span>
      <button type="button" className="pwa-install-btn" onClick={() => void install()}>
        Install
      </button>
      <button
        type="button"
        className="pwa-install-dismiss"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, '1')
          setDismissed(true)
        }}
      >
        Not now
      </button>
    </div>
  )
}
