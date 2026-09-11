import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { acceptBoardInvite, getInvitePreview } from '@/db/repositories/inviteRepo'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError'
import '@/styles/board.css'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [boardName, setBoardName] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /* Same fix as SignInPage: a sent link replaces the form, because a single
     line under an unchanged button reads as nothing having happened. This
     page matters more than sign-in, since everyone who lands here is new. */
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void getInvitePreview(token).then((preview) => {
      setBoardName(preview?.boardName ?? null)
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!token || !supabase) return

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      void acceptBoardInvite(token)
        .then(() => navigate('/app', { replace: true }))
        .catch((err) => setMessage(err instanceof Error ? err.message : 'Could not join board'))
    })
  }, [token, navigate])

  const signIn = async () => {
    const address = email.trim()
    if (!supabase || !address || !token || busy) return
    setBusy(true)
    setMessage('')
    sessionStorage.setItem('memo_pending_invite', token)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/invite/${token}` },
    })
    setBusy(false)
    if (error) setMessage(friendlyAuthError(error, { googleAvailable: true }))
    else setSentTo(address)
  }

  /* Email was the only way in from an invite, and until the project has its
     own SMTP Supabase will not email anyone outside Owen's own team, so every
     invited bandmate would have been stuck here with no route onto the board.
     Google comes back to this same invite URL, and the effect above accepts
     the invite as soon as it sees a signed-in user. */
  const signInWithGoogle = async () => {
    if (!supabase || !token) return
    setBusy(true)
    setMessage('')
    sessionStorage.setItem('memo_pending_invite', token)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/invite/${token}` },
    })
    if (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="invite-page">
        <p>Loading invite…</p>
      </div>
    )
  }

  if (!boardName) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <h1>Invite not found</h1>
          <p>This link may have expired.</p>
          <Link to="/">← Home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <h1>Join {boardName}</h1>
        {sentTo ? (
          <div role="status" aria-live="polite">
            <p>
              We sent a link to <strong>{sentTo}</strong>. Open it on this device, in this browser,
              and you&apos;ll land on the board. It won&apos;t work from a different browser, and it
              works once.
            </p>
            <p>Nothing there after a minute? Check spam. For now it comes from Supabase Auth.</p>
            <button type="button" className="invite-primary" onClick={() => setSentTo(null)}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <p>Enter your email and we&apos;ll send a link that opens the board. No password.</p>
            {!supabaseConfigured ? (
              <p>Add Supabase credentials to enable invites.</p>
            ) : (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void signIn()
                  }}
                  placeholder="your@email.com"
                  className="invite-input"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void signIn()}
                  className="invite-primary"
                  disabled={busy}
                >
                  {busy ? 'Sending…' : 'Email me the link'}
                </button>
                <p className="invite-or">or</p>
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="invite-secondary"
                  disabled={busy}
                >
                  Continue with Google
                </button>
              </>
            )}
          </>
        )}
        {message && <p className="invite-message">{message}</p>}
      </div>
    </div>
  )
}
