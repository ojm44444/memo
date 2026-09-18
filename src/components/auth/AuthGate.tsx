import { type ReactNode, useEffect, useState } from 'react'
import { PlanGate } from './PlanGate'
import { getTwoStepFactor, needsTwoStepCode, verifyTwoStepCode } from '@/lib/auth/twoStep'
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

  return (
    <TwoStepGate>
      <PlanGate>{children}</PlanGate>
    </TwoStepGate>
  )
}

/**
 * Accounts with two-step login on give their authenticator code before the
 * board opens. Offline, the board still opens from this device (the cloud
 * refuses the data without the code anyway), so nobody is locked out of the
 * music already on their own machine.
 */
function TwoStepGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'needs' | 'ok'>('checking')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void needsTwoStepCode()
      .catch(() => false)
      .then((needs) => live && setState(needs ? 'needs' : 'ok'))
    return () => {
      live = false
    }
  }, [])

  if (state === 'ok') return <>{children}</>
  if (state === 'checking') {
    return (
      <div className="auth-gate-loading">
        <p>Loading your board…</p>
      </div>
    )
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const factor = await getTwoStepFactor()
      if (!factor) {
        setState('ok')
        return
      }
      await verifyTwoStepCode(factor.id, code)
      setState('ok')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-gate-loading two-step-gate">
      <h2 className="two-step-gate-title">Enter your code</h2>
      <p className="auth-gate-loading-sub">Open your authenticator app and type the 6-digit code for songdrafts.</p>
      <input
        className="two-step-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && code.replace(/\D/g, '').length === 6) void submit()
        }}
      />
      <button
        type="button"
        className="two-step-gate-btn"
        disabled={busy || code.replace(/\D/g, '').length !== 6}
        onClick={() => void submit()}
      >
        {busy ? 'Checking…' : 'Continue'}
      </button>
      {error && <p className="two-step-error">{error}</p>}
    </div>
  )
}
