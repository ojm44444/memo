import { useEffect, useState } from 'react'
import { subscribePwaUpdate, applyPwaUpdate } from '@/lib/pwa/register'

export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    return subscribePwaUpdate(() => setVisible(true))
  }, [])

  if (!visible) return null

  return (
    <div className="pwa-update-banner" role="status">
      <span>A new version of mem• is ready.</span>
      <button type="button" className="pwa-update-btn" onClick={() => applyPwaUpdate()}>
        Update now
      </button>
    </div>
  )
}
