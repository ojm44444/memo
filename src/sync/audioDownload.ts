import { createId } from '@/lib/ids'
import { supabase } from '@/lib/supabase/client'
import { db } from '@/db/database'
import type { AudioBlob } from '@/types/audio-version'
import { canAutoDownload, recordAutoDownload } from './egressBudget'

/**
 * Pulling cloud audio down onto this device.
 *
 * THE EXPENSIVE PART OF THE WHOLE APP. Everything else moves rows; this moves
 * megabytes, and it is metered. Read the backoff below before changing
 * anything here.
 */

export async function countUncachedRemoteAudio() {
  return db.audioVersions
    .filter((version) => Boolean(version.storagePath) && !version.localBlobId)
    .count()
}

/**
 * Versions that failed, and when it is worth trying them again.
 *
 * THIS IS THE BILL CONTROL, not a nicety.
 *
 * The sync loop runs every eight seconds and asked for four uncached files
 * each time. A file is "uncached" until its blob is written locally, so any
 * failure AFTER the bytes arrive, and the write is where failures actually
 * happen: browser storage quota, a private window, a full disk, leaves the
 * version exactly as it was. The next tick selected the same four files, in
 * the same order, and downloaded them again. Forever, at four files every
 * eight seconds, paying full egress on every attempt while making no progress.
 * That is how a library of a few hundred megabytes turned into gigabytes of
 * bandwidth without anybody uploading anything.
 *
 * Held in memory rather than the database on purpose: a reload is a
 * legitimate reason to try again, and this must never be the thing that
 * permanently refuses to fetch someone's music.
 */
const failures = new Map<string, { attempts: number; nextAttempt: number }>()

/** 30s, 1m, 2m, 4m, 8m, then hourly. Capped so nothing is abandoned forever. */
function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** (attempts - 1), 60 * 60 * 1000)
}

function shouldSkip(versionId: string, now: number): boolean {
  const failure = failures.get(versionId)
  return failure ? now < failure.nextAttempt : false
}

function noteFailure(versionId: string) {
  const previous = failures.get(versionId)
  const attempts = (previous?.attempts ?? 0) + 1
  failures.set(versionId, { attempts, nextAttempt: Date.now() + backoffMs(attempts) })
}

function noteSuccess(versionId: string) {
  failures.delete(versionId)
}

/** Test seam, and the thing to call after a manual retry from Settings. */
export function resetAudioDownloadBackoff() {
  failures.clear()
}

export async function cacheRemoteAudioVersion(versionId: string) {
  const version = await db.audioVersions.get(versionId)
  if (!version || version.localBlobId || !version.storagePath || !supabase) return false

  const { data, error } = await supabase.storage.from('audio').download(version.storagePath)
  if (error) throw error

  // Count it whether or not the write below succeeds. The bytes have already
  // crossed the wire and been paid for; counting only successes would let a
  // loop that fails at the write step, which is exactly the loop that
  // happened, spend without ever registering.
  recordAutoDownload(data.size)

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
  /** Settings' "Download cloud audio" ignores the backoff: a person asked. */
  force?: boolean
}) {
  /**
   * The ceiling. Only applies to downloads the app decided to make; a person
   * pressing the button in Settings passes force and is never stopped.
   */
  if (!options?.force && !canAutoDownload()) {
    const waiting = await countUncachedRemoteAudio()
    return { attempted: 0, cached: 0, remaining: waiting, deferred: waiting }
  }

  const now = Date.now()
  const versions = await db.audioVersions
    .filter((version) => Boolean(version.storagePath) && !version.localBlobId)
    .toArray()

  const eligible = options?.force
    ? versions
    : versions.filter((version) => !shouldSkip(version.id, now))

  const batch = options?.limit ? eligible.slice(0, options.limit) : eligible
  let cached = 0

  for (let index = 0; index < batch.length; index++) {
    const versionId = batch[index].id
    try {
      if (await cacheRemoteAudioVersion(versionId)) {
        cached++
        noteSuccess(versionId)
      }
    } catch {
      // Skip files that fail, and stand further back each time. Retryable from
      // Settings, which clears the backoff.
      noteFailure(versionId)
    }
    options?.onProgress?.(index + 1, batch.length)
  }

  return {
    attempted: batch.length,
    cached,
    remaining: Math.max(0, versions.length - batch.length),
    /** Waiting on a backoff rather than genuinely finished. */
    deferred: versions.length - eligible.length,
  }
}
