import { getAudioBlob } from '@/db/repositories/audioRepo'
import { supabase } from '@/lib/supabase/client'

// Cache object URLs for local blobs so repeated plays skip the IDB read.
// Object URLs are cheap pointers — revoking doesn't free the underlying blob,
// which IDB holds anyway. Safe to keep alive for the session.
const localUrlCache = new Map<string, string>()

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
    const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }

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
