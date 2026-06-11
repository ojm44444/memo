import { useEffect } from 'react'
import { consumeExplicitSignOut, resolveBoardAuth } from '@/lib/auth/session'
import { clearLocalUserBoard } from '@/db/clearLocalUserBoard'
import { db } from '@/db/database'
import { supabase } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/playerStore'
import { ensureBoardForUser } from '@/sync/audioUpload'
import { flush, setCloudSyncEnabled } from '@/sync/syncEngine'
import type { User } from '@supabase/supabase-js'

export function useSyncAuth() {
  useEffect(() => {
    const client = supabase
    if (!client) return

    const onSession = async (event: string, user: User) => {
      setCloudSyncEnabled(true)

      const lastUser = (await db.syncMeta.get('lastUserId'))?.value
      const accountChanged = lastUser && lastUser !== user.id

      if (accountChanged) {
        await clearLocalUserBoard()
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || accountChanged) {
        await db.syncMeta.put({ key: 'lastUserId', value: user.id })
        if (user.email) {
          await db.syncMeta.put({ key: 'lastUserEmail', value: user.email })
        }
        await db.syncMeta.delete('boardId')
        await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })
      }

      if (navigator.onLine) {
        try {
          await ensureBoardForUser(user.id)
        } catch {
          // Board bootstrap can wait until connectivity returns.
        }
      }

      void flush()
    }

    void resolveBoardAuth().then(async (auth) => {
      if (auth) {
        const lastUser = (await db.syncMeta.get('lastUserId'))?.value
        const accountChanged = lastUser && lastUser !== auth.user.id
        if (accountChanged) await clearLocalUserBoard()
        void onSession('INITIAL_SESSION', auth.user)
      } else {
        setCloudSyncEnabled(false)
      }
    })

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        usePlayerStore.getState().stop()

        if (consumeExplicitSignOut()) {
          setCloudSyncEnabled(false)
          void clearLocalUserBoard()
          return
        }

        void resolveBoardAuth().then((auth) => {
          if (auth?.offlineGrace) {
            setCloudSyncEnabled(true)
            void onSession('OFFLINE_GRACE', auth.user)
            return
          }

          setCloudSyncEnabled(false)
          if (navigator.onLine) void clearLocalUserBoard()
        })
        return
      }

      const user = session?.user
      if (user) void onSession(event, user)
    })

    return () => {
      setCloudSyncEnabled(false)
      sub.subscription.unsubscribe()
    }
  }, [])
}
