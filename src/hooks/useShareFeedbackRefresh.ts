import { useEffect } from 'react'
import { getAllSongs } from '@/db/repositories/boardRepo'
import { refreshShareFeedbackCache } from '@/db/repositories/shareFeedbackRepo'
import { getSyncStatus, subscribeSync } from '@/sync/syncEngine'

export function useShareFeedbackRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const refresh = () => {
      void getAllSongs().then((songs) => refreshShareFeedbackCache(songs.map((song) => song.id)))
    }

    refresh()

    const unsubscribe = subscribeSync(() => {
      const { status, online } = getSyncStatus()
      if (online && status === 'idle') refresh()
    })

    return () => {
      unsubscribe()
    }
  }, [enabled])
}
