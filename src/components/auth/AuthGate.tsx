import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { clearLocalUserBoard } from '@/db/clearLocalUserBoard'
import { useAuthSession } from '@/hooks/useAuthSession'

interface AuthGateProps {
  children: ReactNode
}

/**
 * Board requires a signed-in account (session cached on device for offline use).
 * Clears IndexedDB only when truly signed out — not when offline on a plane.
 */
export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuthSession()
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    if (auth.status !== 'signed_out') {
      setCleared(false)
      return
    }

    // Never wipe local memos while offline — session may refresh when Wi‑Fi returns.
    if (!navigator.onLine) return

    let cancelled = false
    void clearLocalUserBoard().then(() => {
      if (!cancelled) setCleared(true)
    })

    return () => {
      cancelled = true
    }
  }, [auth.status])

  if (auth.status === 'loading' || (auth.status === 'signed_out' && !cleared)) {
    return (
      <div className="auth-gate-loading">
        <p>Loading your board…</p>
      </div>
    )
  }

  if (auth.status === 'unconfigured') {
    return (
      <div className="auth-gate-loading">
        <p>Cloud sign-in isn&apos;t configured on this deployment.</p>
        <Link to="/">Back to home</Link>
      </div>
    )
  }

  if (auth.status === 'signed_out') {
    if (!navigator.onLine) {
      return (
        <div className="auth-gate-loading">
          <p>You&apos;re offline and need to sign in again when you have Wi‑Fi.</p>
          <p className="auth-gate-loading-sub">
            If you&apos;ve used mem• on this device before, try opening the app again once
            you&apos;re online — your memos should still be here.
          </p>
        </div>
      )
    }
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
