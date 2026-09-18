import { usePageTitle } from '@/hooks/usePageTitle'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveBoardAuth } from '@/lib/auth/session'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/globals.css'
import '@/styles/sign-in.css'
import '@/styles/record.css'
import { RecordArt } from '@/components/share/RecordParts'
import { Wordmark } from '@/components/ui/Wordmark'
import { signupsAllowed } from '@/lib/signupsOpen'
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError'
import { renderGoogleButton } from '@/lib/auth/googleIdentity'
import {
  captureFirstTouch,
  getHeardFrom,
  heardFromChosen,
  setHeardFrom,
  type HeardFromValue,
} from '@/lib/attribution'
import { HeardFromQuestion } from '@/components/auth/HeardFromQuestion'

/** Our own pause between resends, so a double tap cannot send two links. */
const RESEND_COOLDOWN_S = 30

export function SignInPage({ mode = 'sign-in' }: { mode?: 'sign-in' | 'create' }) {
  const creating = mode === 'create'
  usePageTitle(
    creating ? 'Create account · songdrafts' : 'Sign in · songdrafts',
    creating ? 'Create your songdrafts account.' : 'Sign in to your songdrafts board.',
  )
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [allowed] = useState(signupsAllowed)
  /* The address a link was actually sent to. While this is set the page shows
     "Check your email" instead of the form. See signInWithEmail for why. */
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [code, setCode] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const googleSlot = useRef<HTMLDivElement>(null)
  /* Create account only: the one-tap question above the buttons. */
  const [heard, setHeard] = useState<HeardFromValue | null>(() =>
    creating ? (getHeardFrom()?.source ?? null) : null,
  )
  const [heardOther, setHeardOther] = useState(() => (creating ? (getHeardFrom()?.other ?? '') : ''))
  const needsHeard = creating && !heardFromChosen(heard)

  /* Google's own button, so its screen says songdrafts.com rather than the
     Supabase address. Our redirect button stays as the fallback. */
  useEffect(() => {
    const el = googleSlot.current
    if (!el || checking || sentTo || !supabase) return
    /* Google's own button signs in the moment it is tapped, so it is only
       drawn once the question is answered. */
    if (needsHeard) return
    let live = true
    void renderGoogleButton(el, {
      text: creating ? 'signup_with' : 'continue_with',
      width: Math.min(360, Math.round(el.getBoundingClientRect().width) || 320),
      onError: (m) => live && setMessage(m),
    }).then((ok) => live && setGoogleReady(ok))
    return () => {
      live = false
    }
  }, [checking, sentTo, creating, needsHeard])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendIn])

  /* A tagged link can point straight here, skipping the landing page. Keeps
     the first touch if one was already recorded. See lib/attribution. */
  useEffect(() => {
    captureFirstTouch()
  }, [])

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
        <SignInArt />
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

  const chooseHeard = (next: Parameters<typeof setHeardFrom>[0]) => {
    setHeard(next?.source ?? null)
    setHeardFrom(next)
  }

  const changeHeardOther = (text: string) => {
    setHeardOther(text)
    if (heard === 'other') setHeardFrom({ source: 'other', other: text })
  }

  const signInWithGoogle = async () => {
    if (needsHeard) return
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

  /* The link always sent. On 8 Sept Supabase's auth log shows Owen's request
     at 21:34:25 and the email going out at 21:34:27, and it arrived. He still
     reported "send magic link doesn't work", and signed in with Google twenty
     seconds later, because of what this page did next: the button said
     "Sending…" for two seconds, went back to "Send magic link" with the form
     unchanged, and the only sign of success was one small line under the
     Google button at the bottom of the card. It read as nothing happening.
     A sent link now replaces the form with a screen that says what to do. */
  const signInWithEmail = async () => {
    const address = email.trim()
    if (!address || needsHeard) return
    setBusy(true)
    setMessage('')
    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo },
    })
    setBusy(false)
    if (error) {
      setMessage(friendlyAuthError(error, { googleAvailable: true }))
      return
    }
    setSentTo(address)
    setResendIn(RESEND_COOLDOWN_S)
  }

  const verifyCode = async () => {
    const token = code.replace(/\D/g, '')
    if (!sentTo || token.length < 6) return
    setBusy(true)
    setMessage('')
    const { error } = await client.auth.verifyOtp({ email: sentTo, token, type: 'email' })
    setBusy(false)
    if (error) setMessage('That code did not work. Check it, or send a new one.')
  }

  if (checking) {
    return (
      <div className="sign-in-page">
        <SignInArt />
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
        <SignInArt />
        <div className="sign-in-card">
          <Link to="/" className="sign-in-logo">
            <Wordmark />
          </Link>
          <h2 className="sign-in-title">Not open yet</h2>
          <p className="sign-in-sub">
            songdrafts is still being finished, so new accounts are closed for now.
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

  if (sentTo) {
    return (
      <div className="sign-in-page">
        <SignInArt />
        <div className="sign-in-card" role="status" aria-live="polite">
          <Link to="/" className="sign-in-logo">
            <Wordmark />
          </Link>
          <h2 className="sign-in-title">Check your email</h2>
          <p className="sign-in-sub">
            We sent a link to <strong className="sign-in-sent-to">{sentTo}</strong>.
            {creating ? ' Open it and your account is made.' : ''}
          </p>

          <p className="sign-in-sub">Open the link on this device, or type the code from the email.</p>
          <input
            className="sign-in-input sign-in-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            aria-label="Code from the email"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void verifyCode()
            }}
          />
          <button
            type="button"
            className="sign-in-submit"
            disabled={busy || code.replace(/\D/g, '').length < 6}
            onClick={() => void verifyCode()}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <p className="sign-in-muted sign-in-spam">
            It can take a minute to arrive. If it is not there, check spam and junk, then send it again.
          </p>

          <button
            type="button"
            className="sign-in-google"
            disabled={busy || resendIn > 0}
            onClick={() => void signInWithEmail()}
          >
            {busy ? 'Sending…' : resendIn > 0 ? `Send it again in ${resendIn}s` : 'Send it again'}
          </button>

          {message && <p className="sign-in-message">{message}</p>}

          <button
            type="button"
            className="sign-in-secondary sign-in-link-button"
            onClick={() => {
              setSentTo(null)
              setMessage('')
            }}
          >
            ← Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sign-in-page">
        <SignInArt />
      <div className="sign-in-card">
        <Link to="/" className="sign-in-logo">
          <Wordmark />
        </Link>
        {/* 16 Sept, Owen: "there's no way to create an account". There was:
            signInWithOtp makes the account the first time. But no screen ever
            said so, so a new person saw only Sign in. Now there are two doors,
            /sign-up and /sign-in, each saying plainly what it does. */}
        <h2 className="sign-in-title">{creating ? 'Create your account' : 'Sign in'}</h2>
        <p className="sign-in-sub">
          {creating
            ? 'Enter your email and we send you a link. Open it and your account is ready. No password.'
            : 'We email you a link and you are in. No password to remember.'}
        </p>

        {offline && (
          <p className="sign-in-message">
            You&apos;re offline. If you&apos;ve signed in on this device before, open{' '}
            <Link to="/app">your board</Link> directly.
          </p>
        )}

        {creating && (
          <HeardFromQuestion
            value={heard}
            other={heardOther}
            onChange={chooseHeard}
            onOtherChange={changeHeardOther}
            disabled={busy}
          />
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
          disabled={busy || offline || needsHeard}
          onClick={() => void signInWithEmail()}
        >
          {busy ? 'Sending…' : creating ? 'Create account' : 'Email me a sign-in link'}
        </button>

        {needsHeard && <p className="sign-in-muted sign-in-heard-hint">Pick one above to carry on.</p>}

        {/* Right under the button that caused it. It used to sit at the very
            bottom of the card, below Google, which is how a successful send
            read as nothing happening on 8 Sept. */}
        {message && <p className="sign-in-message">{message}</p>}

        <div className="sign-in-divider">
          <span>or</span>
        </div>

        <div
          ref={googleSlot}
          className="sign-in-google-slot"
          style={googleReady && !needsHeard ? undefined : { display: 'none' }}
        />
        {(!googleReady || needsHeard) && (
          <button
            type="button"
            className="sign-in-google"
            disabled={busy || offline || needsHeard}
            onClick={() => void signInWithGoogle()}
          >
            {creating ? 'Sign up with Google' : 'Continue with Google'}
          </button>
        )}

        <p className="sign-in-switch">
          {creating ? (
            <>
              Already have an account? <Link to="/sign-in">Sign in</Link>
            </>
          ) : (
            <>
              New to songdrafts? <Link to="/sign-up">Create an account</Link>
            </>
          )}
        </p>


        <Link to="/" className="sign-in-secondary">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}

/** The brand cover beside the form (17 Sept, Owen: the login page looked bad). */
function SignInArt() {
  return (
    <div className="sign-in-art" aria-hidden>
      <RecordArt seed="sign-in" label="" variant={0} />
      <p className="sign-in-art-line">
        Voice memos, demos, mixes and masters.
        <br />
        One place, one link.
      </p>
    </div>
  )
}
