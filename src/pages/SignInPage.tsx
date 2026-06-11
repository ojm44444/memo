import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveBoardAuth } from '@/lib/auth/session'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/globals.css'
import '@/styles/sign-in.css'

export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const onOffline = () => setOffline(true)
    const onOnline = () => setOffline(false)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setChecking(false)
      return
    }

    void resolveBoardAuth().then((auth) => {
      if (auth) {
        navigate('/app', { replace: true })
        return
      }
      setChecking(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) navigate('/app', { replace: true })
    })

    return () => sub.subscription.unsubscribe()
  }, [navigate])

  if (!supabaseConfigured || !supabase) {
    return (
      <div className="sign-in-page">
        <div className="sign-in-card">
          <h1>
            mem<span>•</span>
          </h1>
          <p>Cloud sync isn&apos;t configured on this deployment.</p>
          <p className="sign-in-muted">Sign-in is required to use your board.</p>
        </div>
      </div>
    )
  }

  const client = supabase
  const redirectTo = `${window.location.origin}/app`

  const signInWithGoogle = async () => {
    setBusy(true)
    setMessage('')
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      const hint =
        error.message.includes('not enabled') || error.message.includes('Unsupported provider')
          ? 'Google sign-in isn\'t enabled in Supabase yet. Use your email below, or enable Google under Authentication → Providers in the Supabase dashboard.'
          : error.message
      setMessage(hint)
      setBusy(false)
    }
  }

  const signInWithEmail = async () => {
    if (!email.trim()) return
    setBusy(true)
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setMessage(error ? error.message : 'Check your email for the magic link.')
    setBusy(false)
  }

  if (checking) {
    return (
      <div className="sign-in-page">
        <div className="sign-in-card">
          <p className="sign-in-muted">Checking session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sign-in-page">
      <div className="sign-in-card">
        <Link to="/" className="sign-in-logo">
          mem<span>•</span>
        </Link>
        <h2 className="sign-in-title">Sign in to your board</h2>
        <p className="sign-in-sub">
          Sign in once. After that, mem• works offline on planes and trains — changes save on this
          device and upload automatically when you&apos;re back online.
        </p>

        {offline && (
          <p className="sign-in-message">
            You&apos;re offline. If you&apos;ve signed in on this device before, open{' '}
            <Link to="/app">your board</Link> directly.
          </p>
        )}

        <button
          type="button"
          className="sign-in-google"
          disabled={busy || offline}
          onClick={() => void signInWithGoogle()}
        >
          Continue with Google
        </button>

        <div className="sign-in-divider">
          <span>or</span>
        </div>

        <input
          type="email"
          className="sign-in-input"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void signInWithEmail()
          }}
        />
        <button
          type="button"
          className="sign-in-submit"
          disabled={busy || offline}
          onClick={() => void signInWithEmail()}
        >
          {busy ? 'Sending…' : 'Send magic link'}
        </button>

        {message && <p className="sign-in-message">{message}</p>}

        <Link to="/" className="sign-in-secondary">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
