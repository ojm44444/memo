import { useEffect, useRef } from 'react'
import { getAllSongs } from '@/db/repositories/boardRepo'
import { refreshShareFeedbackCache } from '@/db/repositories/shareFeedbackRepo'
import { getSyncStatus, subscribeSync } from '@/sync/syncEngine'

/**
 * How long to leave between refreshes.
 *
 * The refresh fires once on mount and then on every sync settle, and the
 * outbox settles constantly while someone is working: a drag, a rename and a
 * tag are three settles inside ten seconds. Each one re-read the whole
 * board's share feedback. Listener feedback arrives on a human timescale, so
 * a minute of staleness costs nothing and the reads are metered egress.
 */
const MIN_INTERVAL_MS = 60_000

export function useShareFeedbackRefresh(enabled: boolean) {
  const lastRun = useRef(0)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const refresh = (force = false) => {
      const now = Date.now()
      if (inFlight.current) return
      if (!force && now - lastRun.current < MIN_INTERVAL_MS) return

      inFlight.current = true
      lastRun.current = now
      void getAllSongs()
        .then((songs) => refreshShareFeedbackCache(songs.map((song) => song.id)))
        .finally(() => {
          inFlight.current = false
        })
    }

    refresh(true)

    const unsubscribe = subscribeSync(() => {
      const { status, online } = getSyncStatus()
      if (online && status === 'idle') refresh()
    })

    return () => {
      unsubscribe()
    }
  }, [enabled])
}
