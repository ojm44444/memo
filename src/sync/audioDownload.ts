import { createId } from '@/lib/ids'
import { supabase } from '@/lib/supabase/client'
import { db } from '@/db/database'
import type { AudioBlob } from '@/types/audio-version'

export async function countUncachedRemoteAudio() {
  return db.audioVersions
    .filter((version) => Boolean(version.storagePath) && !version.localBlobId)
    .count()
}

export async function cacheRemoteAudioVersion(versionId: string) {
  const version = await db.audioVersions.get(versionId)
  if (!version || version.localBlobId || !version.storagePath || !supabase) return false

  const { data, error } = await supabase.storage.from('audio').download(version.storagePath)
  if (error) throw error

  const blobId = createId()
  const blob: AudioBlob = {
    id: blobId,
    blob: data,
    mimeType: version.mimeType || data.type || 'audio/mp4',
    size: data.size,
    createdAt: new Date().toISOString(),
  }

  await db.transaction('rw', db.audioBlobs, db.audioVersions, async () => {
    await db.audioBlobs.put(blob)
    await db.audioVersions.update(versionId, { localBlobId: blobId })
  })

  return true
}

export async function cachePendingRemoteAudio(options?: {
  limit?: number
  onProgress?: (done: number, total: number) => void
}) {
  const versions = await db.audioVersions
    .filter((version) => Boolean(version.storagePath) && !version.localBlobId)
    .toArray()

  const batch = options?.limit ? versions.slice(0, options.limit) : versions
  let cached = 0

  for (let index = 0; index < batch.length; index++) {
    try {
      if (await cacheRemoteAudioVersion(batch[index].id)) cached++
    } catch {
      // Skip files that fail to download — user can retry from settings.
    }
    options?.onProgress?.(index + 1, batch.length)
  }

  return { attempted: batch.length, cached, remaining: Math.max(0, versions.length - batch.length) }
}
