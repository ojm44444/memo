import { getAudioBlob } from '@/db/repositories/audioRepo'
import { supabase } from '@/lib/supabase/client'

export async function resolvePlaybackUrl(
  localBlobId: string | null,
  storagePath: string | null,
): Promise<string | null> {
  if (localBlobId) {
    const record = await getAudioBlob(localBlobId)
    if (record) return URL.createObjectURL(record.blob)
  }

  if (storagePath && supabase) {
    const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 3600)
    return data?.signedUrl ?? null
  }

  return null
}
