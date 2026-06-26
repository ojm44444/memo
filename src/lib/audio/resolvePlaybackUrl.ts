import { getAudioBlob } from '@/db/repositories/audioRepo'
import { supabase } from '@/lib/supabase/client'

// Cache object URLs for local blobs and signed URLs for cloud paths.
// Both are safe to keep for the session — signed URLs are valid for 1 hour.
const localUrlCache = new Map<string, string>()
const signedUrlCache = new Map<string, string>()

export async function resolvePlaybackUrl(
  localBlobId: string | null,
  storagePath: string | null,
): Promise<string | null> {
  if (localBlobId) {
    const cached = localUrlCache.get(localBlobId)
    if (cached) return cached

    const record = await getAudioBlob(localBlobId)
    if (record) {
      const url = URL.createObjectURL(record.blob)
      localUrlCache.set(localBlobId, url)
      return url
    }
  }

  if (storagePath && supabase) {
    const cached = signedUrlCache.get(storagePath)
    if (cached) return cached
    const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) {
      signedUrlCache.set(storagePath, data.signedUrl)
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
