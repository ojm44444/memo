import { type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthSession } from '@/hooks/useAuthSession'

interface AuthGateProps {
  children: ReactNode
}

/**
 * The board requires a signed-in account, with the session cached on the
 * device so it keeps working without a network.
 *
 * THIS COMPONENT NO LONGER DELETES ANYTHING.
 *
 * It used to call clearLocalUserBoard whenever it saw a signed-out state while
 * navigator.onLine was true, on the reasoning that a signed-out device should
 * not show the previous account's memos. The reasoning was sound and the
 * trigger was not: "we could not confirm the session" and "this person signed
 * out" are different events, and every way of failing to reach Supabase
 * produced the first while looking like the second. A refused token refresh, a
 * quota block, a captive portal, or simply a getSession call that took longer
 * than three seconds all ended with IndexedDB cleared: songs, audio blobs, and
 * the queue of changes that had not yet been uploaded. For a product whose
 * entire promise is that your unreleased music is on your own machine, that is
 * the worst bug it is possible to have, and it fires on a slow train.
 *
 * Deleting on sign-out is still correct, and still happens: the sign-out
 * button clears the board itself, in the one place where the intent is
 * unambiguous because a person pressed it. That made the wipe here redundant
 * as well as dangerous.
 *
 * What is left is a gate that shows or withholds the board and never destroys
 * data to do it.
 */
export function AuthGate({ children }: AuthGateProps) {
  const auth = useAuthSession()

  if (auth.status === 'loading') {
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
          <p>You&apos;re offline.</p>
          <p className="auth-gate-loading-sub">
            Your memos are saved on this device. Sign in when you&apos;re back online to sync.
          </p>
        </div>
      )
    }
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
