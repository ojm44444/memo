import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveBoardAuth } from '@/lib/auth/session'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/globals.css'
import '@/styles/sign-in.css'
import { Wordmark } from '@/components/ui/Wordmark'
import { signupsAllowed } from '@/lib/signupsOpen'

export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [allowed] = useState(signupsAllowed)

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
            <Wordmark />
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

  /* Closed until billing exists. Gates the FORM, not the session: anyone
     already signed in carries on untouched, and ?key= lets Owen and invited
     testers straight through. See lib/signupsOpen.ts. */
  if (!allowed) {
    return (
      <div className="sign-in-page">
        <div className="sign-in-card">
          <Link to="/" className="sign-in-logo">
            <Wordmark />
          </Link>
          <h2 className="sign-in-title">Not open yet</h2>
          <p className="sign-in-sub">
            songdrafts is still being finished, so new accounts are closed for now. Nothing here
            is collecting your email either, so there is no list to join and nothing to unsubscribe
            from later.
          </p>
          {/* Used to say "already have an account? open your board directly",
              linking to /app. That link could never work: by the time this
              screen renders, resolveBoardAuth() has already run in the
              effect above and found no session, because a real session would
              have redirected to /app before this paragraph ever painted.
              Anyone who actually reaches this text has, by construction,
              nothing that link could open. It was a dead link promising to
              do the one thing it structurally cannot. Removed rather than
              fixed forward, since there is nothing true left to say here on
              this device: a session either exists (and you never see this
              page) or it does not (and there is no board to open). */}
          <Link to="/" className="sign-in-back">Back to songdrafts</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sign-in-page">
      <div className="sign-in-card">
        <Link to="/" className="sign-in-logo">
          <Wordmark />
        </Link>
        <h2 className="sign-in-title">Sign in to your board</h2>
        <p className="sign-in-sub">
          Sign in once. After that, songdrafts works offline on planes and trains. Changes save on this
          device and upload automatically when you&apos;re back online.
        </p>

        {offline && (
          <p className="sign-in-message">
            You&apos;re offline. If you&apos;ve signed in on this device before, open{' '}
            <Link to="/app">your board</Link> directly.
          </p>
        )}

        {/* First party before third party (BD ruling 4). The email path is
            ours; Google is a convenience. The old order led with a pure white
            Google button that was the loudest element on a dark screen and
            made Google the brand on our own front door. */}
        <input
          type="email"
          className="sign-in-input"
          placeholder="your@email.com"
          aria-label="Your email address"
          autoComplete="email"
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

        <div className="sign-in-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="sign-in-google"
          disabled={busy || offline}
          onClick={() => void signInWithGoogle()}
        >
          Continue with Google
        </button>

        {message && <p className="sign-in-message">{message}</p>}

        <Link to="/" className="sign-in-secondary">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
