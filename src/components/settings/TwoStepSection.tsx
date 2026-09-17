import { useEffect, useState } from 'react'
import {
  getTwoStepFactor,
  startTwoStepSetup,
  turnOffTwoStep,
  verifyTwoStepCode,
} from '@/lib/auth/twoStep'

type Setup = { factorId: string; qr: string; secret: string }

export function TwoStepSection() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getTwoStepFactor().then((f) => live && setFactorId(f?.id ?? null))
    return () => {
      live = false
    }
  }, [])

  if (factorId === undefined) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Two-step login</h3>

      {factorId ? (
        <>
          <p className="settings-install-note">
            On. Signing in on a new device asks for the code from your authenticator app.
          </p>
          <button
            type="button"
            className="settings-install-btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm('Turn off two-step login?')) return
                await turnOffTwoStep(factorId)
                setFactorId(null)
              })
            }
          >
            Turn off
          </button>
        </>
      ) : setup ? (
        <div className="two-step-setup">
          <p className="settings-install-note">
            1. Open an authenticator app (Passwords on iPhone, Google Authenticator, 1Password) and scan this.
          </p>
          <img className="two-step-qr" src={setup.qr} alt="QR code for your authenticator app" />
          <p className="settings-install-note two-step-secret">
            Or type this key: <code>{setup.secret}</code>
          </p>
          <p className="settings-install-note">2. Type the 6-digit code it shows.</p>
          <input
            className="two-step-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            className="settings-install-btn"
            disabled={busy || code.replace(/\D/g, '').length !== 6}
            onClick={() =>
              void run(async () => {
                await verifyTwoStepCode(setup.factorId, code)
                setFactorId(setup.factorId)
                setSetup(null)
                setCode('')
              })
            }
          >
            Turn on
          </button>
        </div>
      ) : (
        <>
          <p className="settings-install-note">
            Add a code from an authenticator app on top of your email sign-in. Nobody gets into your
            songs without your phone.
          </p>
          <button
            type="button"
            className="settings-install-btn"
            disabled={busy}
            onClick={() => void run(async () => setSetup(await startTwoStepSetup()))}
          >
            Set up two-step login
          </button>
        </>
      )}

      {message && <p className="settings-install-note two-step-error">{message}</p>}
    </section>
  )
}
