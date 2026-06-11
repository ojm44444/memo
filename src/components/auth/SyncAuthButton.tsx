import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { markExplicitSignOut } from '@/lib/auth/session'
import { clearLocalUserBoard } from '@/db/clearLocalUserBoard'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/playerStore'
import type { User } from '@supabase/supabase-js'

export function SyncAuthButton() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured || !supabase) return null

  const client = supabase

  const signOut = async () => {
    usePlayerStore.getState().stop()
    markExplicitSignOut()
    await clearLocalUserBoard()
    await client.auth.signOut()
    navigate('/sign-in', { replace: true })
  }

  if (user) {
    return (
      <div className="sync-auth">
        <button type="button" className="sync-auth-btn sync-auth-btn--signed-in" onClick={() => void signOut()}>
          {user.email?.split('@')[0]} · sign out
        </button>
      </div>
    )
  }

  return (
    <div className="sync-auth">
      <Link to="/sign-in" className="sync-auth-btn sync-auth-link">
        Sign in to sync
      </Link>
    </div>
  )
}
