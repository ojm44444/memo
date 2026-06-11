import { getAudioBlob } from '@/db/repositories/audioRepo'
import { getSong } from '@/db/repositories/boardRepo'
import { db } from '@/db/database'

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'take'
}

export async function exportSongVersion(versionId: string) {
  const version = await db.audioVersions.get(versionId)
  if (!version?.localBlobId) {
    throw new Error('Audio is not stored locally on this device yet')
  }

  const blobRecord = await getAudioBlob(version.localBlobId)
  if (!blobRecord) throw new Error('Audio file missing')

  const song = await getSong(version.songId)
  const extension = blobRecord.mimeType.includes('wav')
    ? '.wav'
    : blobRecord.mimeType.includes('mpeg')
      ? '.mp3'
      : '.m4a'
  const fileName = `${safeFileName(song?.title ?? version.label)}-${safeFileName(version.label)}${extension}`

  const url = URL.createObjectURL(blobRecord.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
