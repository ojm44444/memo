import { getAudioBlob } from '@/db/repositories/audioRepo'
import { supabase } from '@/lib/supabase/client'

// Cache object URLs for local blobs and signed URLs for cloud paths.
// Capped at MAX_LOCAL_CACHE entries (insertion-order LRU) to avoid holding
// unlimited blobs in memory during long sessions.
const MAX_LOCAL_CACHE = 40
const localUrlCache = new Map<string, string>()
// Signed URLs expire after 3600s — evict after 55 min so we never serve stale ones.
const signedUrlCache = new Map<string, string>()
const signedUrlTimestamps = new Map<string, number>()
const SIGNED_URL_TTL_MS = 55 * 60 * 1000

/**
 * Warm the local blob into the object-URL cache without blocking playback.
 * Used when we chose to stream from cloud: the blob is still wanted, because
 * it is what makes the song playable on a plane.
 */
function warmLocalBlob(localBlobId: string) {
  if (localUrlCache.has(localBlobId)) return
  void getAudioBlob(localBlobId).then((record) => {
    if (!record || localUrlCache.has(localBlobId)) return
    if (localUrlCache.size >= MAX_LOCAL_CACHE) {
      const oldest = localUrlCache.keys().next().value
      if (oldest) {
        URL.revokeObjectURL(localUrlCache.get(oldest)!)
        localUrlCache.delete(oldest)
      }
    }
    localUrlCache.set(localBlobId, URL.createObjectURL(record.blob))
  })
}

export async function resolvePlaybackUrl(
  localBlobId: string | null,
  storagePath: string | null,
): Promise<string | null> {
  // Already-resolved local blob is the fastest path there is: no network, and
  // the object URL is seekable immediately.
  if (localBlobId && localUrlCache.has(localBlobId)) {
    return localUrlCache.get(localBlobId)!
  }

  /**
   * Cold start on a long recording.
   *
   * Reading a blob out of IndexedDB pulls the WHOLE file into memory before
   * playback can begin. On a 16-minute rehearsal that is tens of megabytes and
   * seconds of delay on a phone. A signed cloud URL streams instead: the
   * browser issues range requests and starts playing as soon as the first
   * chunk lands.
   *
   * So when we are online and the file exists in the cloud, stream from cloud
   * and warm the local blob behind playback. Offline, or with no cloud copy,
   * the local blob is still the answer and still works.
   */
  if (localBlobId && storagePath && supabase && navigator.onLine) {
    const cachedSigned = signedUrlCache.get(storagePath)
    const cachedAt = signedUrlTimestamps.get(storagePath) ?? 0
    if (cachedSigned && Date.now() - cachedAt < SIGNED_URL_TTL_MS) {
      warmLocalBlob(localBlobId)
      return cachedSigned
    }
    const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) {
      signedUrlCache.set(storagePath, data.signedUrl)
      signedUrlTimestamps.set(storagePath, Date.now())
      warmLocalBlob(localBlobId)
      return data.signedUrl
    }
    // Signing failed; fall through to the local blob.
  }

  if (localBlobId) {
    const cached = localUrlCache.get(localBlobId)
    if (cached) return cached

    const record = await getAudioBlob(localBlobId)
    if (record) {
      const url = URL.createObjectURL(record.blob)
      // Evict oldest entry if at capacity (Map preserves insertion order)
      if (localUrlCache.size >= MAX_LOCAL_CACHE) {
        const oldest = localUrlCache.keys().next().value
        if (oldest) {
          URL.revokeObjectURL(localUrlCache.get(oldest)!)
          localUrlCache.delete(oldest)
        }
      }
      localUrlCache.set(localBlobId, url)
      return url
    }
  }

  if (storagePath && supabase) {
    const cached = signedUrlCache.get(storagePath)
    const cachedAt = signedUrlTimestamps.get(storagePath) ?? 0
    if (cached && Date.now() - cachedAt < SIGNED_URL_TTL_MS) return cached
    // Evict expired entry
    if (cached) {
      signedUrlCache.delete(storagePath)
      signedUrlTimestamps.delete(storagePath)
    }
    if (!navigator.onLine) return null
    const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) {
      signedUrlCache.set(storagePath, data.signedUrl)
      signedUrlTimestamps.set(storagePath, Date.now())
      return data.signedUrl
    }
    return null
  }

  return null
}

/**
 * Synchronously returns a cached URL for the version (local or signed),
 * or null if the URL hasn't been resolved yet.
 */
export function getCachedUrl(
  localBlobId: string | null,
  storagePath: string | null,
): string | null {
  if (localBlobId) return localUrlCache.get(localBlobId) ?? null
  if (storagePath) return signedUrlCache.get(storagePath) ?? null
  return null
}

/** Call when a blob is permanently deleted so the cached URL is revoked. */
export function evictLocalUrl(localBlobId: string) {
  const url = localUrlCache.get(localBlobId)
  if (url) {
    URL.revokeObjectURL(url)
    localUrlCache.delete(localBlobId)
  }
}
