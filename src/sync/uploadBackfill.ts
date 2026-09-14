import { db } from '@/db/database'
import { enqueueSync } from '@/db/repositories/outboxRepo'
import { CLOUD_MAX_BYTES, extensionForMime } from '@/lib/cloudAudio'
import { recordEvent } from '@/lib/analytics'

/**
 * Put every take that never reached the cloud back in the upload queue.
 *
 * WHY THIS EXISTS (14 Sept 2026). Two bugs left takes on one device only:
 *
 *  1. From 26 Aug every audio upload was refused ("permission denied for
 *     function account_within_storage_quota", fixed in migration 029).
 *  2. Since the app first shipped, the bucket refused AIFF, CAF, iPhone video,
 *     FLAC, some WAVs and anything over 50 MB (fixed in migration 032).
 *
 * In both cases the outbox retried five times and then DELETED the job, so
 * fixing the cause brought nothing back: the audio was still in this browser
 * with nothing left that would ever upload it. This finds those takes by what
 * they are (audio on this device, no cloud copy) rather than by the queue,
 * which had forgotten them.
 *
 * Runs after the pull, so a take another device already uploaded has its
 * storagePath and is not sent twice, and only for the board's owner, because
 * a bandmate cannot upload to someone else's board. Once per page load.
 *
 * Reports the count to product_events as 'upload_backfill', so "how close did
 * we come" is a number that can be read off the server.
 */

export interface BackfillResult {
  queued: number
  bytes: number
  tooLarge: number
  missingBlob: number
}

let ranThisPageLoad = false

/** For tests. */
export function resetUploadBackfillForTests() {
  ranThisPageLoad = false
}

export async function requeueStrandedUploadsOnce(): Promise<BackfillResult | null> {
  if (ranThisPageLoad) return null
  ranThisPageLoad = true
  return requeueStrandedUploads()
}

export async function requeueStrandedUploads(): Promise<BackfillResult> {
  const result: BackfillResult = { queued: 0, bytes: 0, tooLarge: 0, missingBlob: 0 }

  const stranded = await db.audioVersions
    .filter((v) => !!v.localBlobId && !v.storagePath && !v.uploadBlockedReason)
    .toArray()
  if (!stranded.length) return result

  const alreadyQueued = new Set(
    (
      await db.syncQueue
        .filter((item) => item.entityType === 'audio_version' && item.op === 'upload')
        .toArray()
    ).map((item) => item.entityId),
  )

  // A take on a song that has since been deleted does not need a cloud copy.
  const liveSongIds = new Set(
    (await db.songs.filter((s) => !s.deletedAt).primaryKeys()) as string[],
  )

  for (const version of stranded) {
    if (alreadyQueued.has(version.id) || !liveSongIds.has(version.songId)) continue

    const blob = await db.audioBlobs.get(version.localBlobId!)
    if (!blob) {
      result.missingBlob++
      continue
    }
    if (blob.size > CLOUD_MAX_BYTES) {
      // Known now, so recorded now rather than failed five times later.
      await db.audioVersions.update(version.id, { uploadBlockedReason: 'too_large' })
      result.tooLarge++
      continue
    }

    await enqueueSync('upload', 'audio_version', version.id, {
      versionId: version.id,
      songId: version.songId,
      // The blob keeps no filename, so name it from its type; the uploader
      // takes the extension from here for the storage path.
      fileName: `${version.id}.${extensionForMime(blob.mimeType)}`,
      mimeType: blob.mimeType,
      durationMs: version.durationMs,
      sortOrder: version.sortOrder,
      label: version.label,
      localBlobId: version.localBlobId!,
    })
    result.queued++
    result.bytes += blob.size
  }

  if (result.queued > 0) void recordEvent('upload_backfill', result.queued, 'queued')
  if (result.tooLarge > 0) void recordEvent('upload_backfill', result.tooLarge, 'too_large')
  if (result.missingBlob > 0) void recordEvent('upload_backfill', result.missingBlob, 'missing_blob')

  return result
}
