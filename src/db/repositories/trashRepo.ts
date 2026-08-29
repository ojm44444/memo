import { db } from '../database'
import type { Song } from '@/types/song'
import { enqueueSync } from './outboxRepo'
import { evictLocalUrl } from '@/lib/audio/resolvePlaybackUrl'

/**
 * The trash: soft-deleted songs, held for 30 days before they go for good.
 *
 * This is the build that makes "a copy, not a mirror" true. deleteSong has
 * always soft-deleted (deletedAt locally, deleted_at server-side via the
 * outbox), so the rows were already surviving — but nothing in the UI could
 * reach them, no purge existed, and no restore existed. From the user's side
 * that was indistinguishable from the iCloud mirror behaviour the landing
 * page positions against, which is why the claim was cut from the backup
 * section. With a visible trash, a stated window and a restore, it is true.
 */
export const TRASH_RETENTION_DAYS = 30

export async function getTrashedSongs(): Promise<Song[]> {
  const songs = await db.songs.filter((s) => !!s.deletedAt).toArray()
  return songs.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

export function daysLeft(deletedAt: string): number {
  const gone = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 86400_000
  return Math.max(0, Math.ceil((gone - Date.now()) / 86400_000))
}

/** Put it back: clears deletedAt here and, via the outbox, everywhere. */
export async function restoreSong(id: string): Promise<void> {
  const song = await db.songs.get(id)
  if (!song || !song.deletedAt) return
  const restored: Song = { ...song, deletedAt: null, updatedAt: new Date().toISOString() }
  await db.songs.put(restored)
  // push maps payload.deletedAt -> deleted_at, so null clears it server-side
  // and other devices pick the song back up on their next pull.
  await enqueueSync('update', 'song', id, restored)
}

/**
 * Delete for good. Not recoverable: local rows and blobs go now, and the
 * audio versions are hard-deleted server-side (the outbox 'delete' op for
 * audio_version is a real delete, unlike the song's soft delete). The song
 * row itself stays soft-deleted in the cloud — unreachable and empty.
 */
export async function purgeSongForGood(id: string): Promise<void> {
  const versions = await db.audioVersions.where('songId').equals(id).toArray()
  for (const v of versions) {
    await db.audioMarkers.where('versionId').equals(v.id).delete()
    await db.audioVersions.delete(v.id)
    if (v.localBlobId) {
      const stillUsed = await db.audioVersions.where('localBlobId').equals(v.localBlobId).count()
      if (stillUsed === 0) {
        evictLocalUrl(v.localBlobId)
        await db.audioBlobs.delete(v.localBlobId)
      }
    }
    await enqueueSync('delete', 'audio_version', v.id, { id: v.id })
  }
  await db.songComments.where('songId').equals(id).delete()
  await db.songs.delete(id)
}

/** Boot sweep: anything past the window goes for good, quietly. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400_000).toISOString()
  const expired = await db.songs.filter((s) => !!s.deletedAt && s.deletedAt < cutoff).toArray()
  for (const s of expired) await purgeSongForGood(s.id)
  return expired.length
}
