import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { acceptBoardInvite, getInvitePreview } from '@/db/repositories/inviteRepo'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import '@/styles/board.css'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [boardName, setBoardName] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

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
    if (!supabase || !email || !token) return
    sessionStorage.setItem('memo_pending_invite', token)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/invite/${token}` },
    })
    setMessage(error ? error.message : 'Check your email for the magic link.')
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
        <p>Sign in to listen and view the board with your bandmate.</p>
        {!supabaseConfigured ? (
          <p>Add Supabase credentials to enable invites.</p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="invite-input"
            />
            <button type="button" onClick={() => void signIn()} className="invite-primary">
              Send magic link
            </button>
          </>
        )}
        {message && <p className="invite-message">{message}</p>}
      </div>
    </div>
  )
}
