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
   * Local blob first. Always.
   *
   * Brief 03 changed this to stream from cloud on the theory that reading a
   * blob from IndexedDB "pulls the whole file into memory". That was wrong.
   * Measured on a real 14.7 MB / 16-minute AAC file:
   *
   *   IndexedDB read      ~1 ms      (Dexie returns a lazy Blob reference;
   *                                   the bytes are never read into JS)
   *   blob -> canplay     25 ms median, 69 ms worst
   *   HTTP -> canplay     ~30 ms on localhost
   *
   * So the local path already beats the target by two orders of magnitude,
   * and preferring the network swapped a constant 25 ms for something that
   * depends on mobile signal. For a local-first app that is a straight
   * downgrade on exactly the journeys this product is sold on. Reverted.
   */
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
