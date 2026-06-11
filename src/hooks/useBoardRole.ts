import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { getBoardUserId } from '@/lib/auth/session'
import { getBoardRole, type BoardRole } from '@/lib/supabase/boardAccess'

export function useBoardRole() {
  const [role, setRole] = useState<BoardRole | 'loading'>('loading')
  const boardId = useLiveQuery(async () => (await db.syncMeta.get('boardId'))?.value ?? null, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const userId = await getBoardUserId()
      if (!userId) {
        if (!cancelled) setRole(null)
        return
      }

      if (!boardId) {
        if (!cancelled) setRole('owner')
        return
      }

      const resolved = await getBoardRole(userId, boardId)
      if (!cancelled) setRole(resolved ?? 'owner')
    })()

    return () => {
      cancelled = true
    }
  }, [boardId])

  return role
}
