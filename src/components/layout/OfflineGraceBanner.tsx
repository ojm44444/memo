import { useAuthSession } from '@/hooks/useAuthSession'

export function OfflineGraceBanner() {
  const auth = useAuthSession()
  if (auth.status !== 'signed_in') return null

  if (auth.offlineGrace) {
    return (
      <div className="offline-grace-banner offline-grace-banner--grace" role="status">
        Session paused offline — you can keep working. Reconnect to Wi‑Fi to sync (no data lost).
      </div>
    )
  }

  if (!navigator.onLine) {
    return (
      <div className="offline-grace-banner" role="status">
        Offline — changes save on this device and upload when you&apos;re back online.
      </div>
    )
  }

  return null
}
