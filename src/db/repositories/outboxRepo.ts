import { createId } from '@/lib/ids'
import type { SyncEntityType, SyncOp } from '@/types/sync'
import { db } from '../database'

const PUSH_PRIORITY: Record<SyncEntityType, number> = {
  board: 0,
  project: 1,
  column: 2,
  listen_project: 2, // before songs: a song can point at one
  song: 3,
  song_link: 4,
  song_comment: 4,
  audio_version: 5,
}

export const MAX_SYNC_ATTEMPTS = 5

export async function enqueueSync(
  op: SyncOp,
  entityType: SyncEntityType,
  entityId: string,
  payload: unknown,
) {
  // Coalesce duplicate ops for the same entity so rapid edits don't flood the queue.
  // - update + update → merge (fields from both, latest wins per field)
  // - update + delete → promote to delete (no point uploading then deleting)
  // - delete + delete → deduplicate
  await db.transaction('rw', db.syncQueue, async () => {
    if (op === 'update' || op === 'delete') {
      const existing = await db.syncQueue
        .where('entityId')
        .equals(entityId)
        .filter((item) => item.entityType === entityType && (item.op === 'update' || item.op === 'delete'))
        .first()

      if (existing) {
        // update + update MERGES the two patches. It used to replace the old
        // payload, so a title edit still queued offline was dropped by the
        // next reorder of the same song (whose patch is only sortOrder).
        let next = payload
        if (op === 'update' && existing.op === 'update') {
          try {
            const before = JSON.parse(existing.payload) as unknown
            if (before && typeof before === 'object' && payload && typeof payload === 'object') {
              next = { ...(before as object), ...(payload as object) }
            }
          } catch {
            // Unreadable old payload: the new one alone is still correct.
          }
        }
        await db.syncQueue.update(existing.id, {
          op,
          payload: JSON.stringify(next),
          createdAt: new Date().toISOString(),
          attempts: 0,
          lastError: null,
        })
        return
      }
    }

    await db.syncQueue.add({
      id: createId(),
      op,
      entityType,
      entityId,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    })
  })
}

export async function getPendingSyncCount() {
  return db.syncQueue.count()
}

export async function getSyncQueue() {
  const queue = await db.syncQueue.orderBy('createdAt').toArray()
  return queue.sort((a, b) => {
    const pa = PUSH_PRIORITY[a.entityType] ?? 9
    const pb = PUSH_PRIORITY[b.entityType] ?? 9
    if (pa !== pb) return pa - pb
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/** The most useful error to show in the UI — real failures first, generic queue hint last. */
export async function getFirstSyncError() {
  const queue = await getSyncQueue()
  const failed = queue.find((item) => item.lastError)
  if (failed?.lastError) return failed.lastError
  return null
}

export async function getPendingUploadsForSong(songId: string) {
  const queue = await db.syncQueue.where('entityType').equals('audio_version').toArray()
  return queue.filter((item) => {
    try {
      const payload = JSON.parse(item.payload) as { songId?: string }
      return payload.songId === songId
    } catch {
      return false
    }
  })
}

export async function getPendingHint() {
  const count = await db.syncQueue.count()
  if (count === 0) return null
  return `${count} upload${count === 1 ? '' : 's'} not finished. Tap to retry`
}

export async function removeSyncItem(id: string) {
  await db.syncQueue.delete(id)
}

export async function markSyncFailed(id: string, error: string) {
  const item = await db.syncQueue.get(id)
  if (!item) return
  await db.syncQueue.update(id, {
    attempts: item.attempts + 1,
    lastError: error,
  })
}
