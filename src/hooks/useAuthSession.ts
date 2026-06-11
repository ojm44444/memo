import { useEffect, useState } from 'react'
import { resolveBoardAuth } from '@/lib/auth/session'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type AuthState =
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: User; offlineGrace: boolean }

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setState({ status: 'unconfigured' })
      return
    }

    const client = supabase

    const refresh = async () => {
      const auth = await resolveBoardAuth()
      setState(
        auth
          ? { status: 'signed_in', user: auth.user, offlineGrace: auth.offlineGrace }
          : { status: 'signed_out' },
      )
    }

    void refresh()

    const { data: sub } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' && !navigator.onLine) {
        const auth = await resolveBoardAuth()
        if (auth) {
          setState({
            status: 'signed_in',
            user: auth.user,
            offlineGrace: auth.offlineGrace,
          })
          return
        }
      }

      if (session?.user) {
        setState({ status: 'signed_in', user: session.user, offlineGrace: false })
        return
      }

      await refresh()
    })

    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)

    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
    }
  }, [])

  return state
}
