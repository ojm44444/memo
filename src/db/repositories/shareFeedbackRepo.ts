import { db } from '@/db/database'
import { listSongShareFeedback } from './shareRepo'

const CACHE_KEY = 'shareFeedbackCache'
const SEEN_KEY = 'shareFeedbackSeen'

type FeedbackCache = Record<string, number>

async function readCache(): Promise<FeedbackCache> {
  const raw = (await db.syncMeta.get(CACHE_KEY))?.value
  if (!raw) return {}
  try {
    return JSON.parse(raw) as FeedbackCache
  } catch {
    return {}
  }
}

async function readSeen(): Promise<FeedbackCache> {
  const raw = (await db.syncMeta.get(SEEN_KEY))?.value
  if (!raw) return {}
  try {
    return JSON.parse(raw) as FeedbackCache
  } catch {
    return {}
  }
}

export async function getShareFeedbackCount(songId: string) {
  const cache = await readCache()
  return cache[songId] ?? 0
}

export async function getUnseenFeedbackSongIds(): Promise<string[]> {
  const [cache, seen] = await Promise.all([readCache(), readSeen()])
  return Object.keys(cache).filter((songId) => (cache[songId] ?? 0) > (seen[songId] ?? 0))
}

export async function markFeedbackSeen(songId: string) {
  const [cache, seen] = await Promise.all([readCache(), readSeen()])
  const updated = { ...seen, [songId]: cache[songId] ?? 0 }
  await db.syncMeta.put({ key: SEEN_KEY, value: JSON.stringify(updated) })
}

export async function refreshShareFeedbackCache(songIds: string[]) {
  if (!songIds.length) {
    await db.syncMeta.delete(CACHE_KEY)
    return
  }

  const cache: FeedbackCache = {}

  await Promise.all(
    songIds.map(async (songId) => {
      try {
        const feedback = await listSongShareFeedback(songId)
        if (feedback.length > 0) cache[songId] = feedback.length
      } catch {
        // ignore per-song errors while offline
      }
    }),
  )

  if (Object.keys(cache).length === 0) {
    await db.syncMeta.delete(CACHE_KEY)
  } else {
    await db.syncMeta.put({ key: CACHE_KEY, value: JSON.stringify(cache) })
  }
}
