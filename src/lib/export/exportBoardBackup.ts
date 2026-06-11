import JSZip from 'jszip'
import { db } from '@/db/database'
import { BACKUP_VERSION } from './backupTypes'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'audio'
}

export async function exportBoardBackup() {
  const [projects, columns, songs, versions, links, comments] = await Promise.all([
    db.projects.orderBy('sortOrder').toArray(),
    db.columns.orderBy('sortOrder').toArray(),
    db.songs.filter((song) => !song.deletedAt).toArray(),
    db.audioVersions.toArray(),
    db.songLinks.toArray(),
    db.songComments.filter((comment) => !comment.deletedAt).toArray(),
  ])

  const zip = new JSZip()
  const audioFolder = zip.folder('audio')
  const versionEntries = versions.map((version) => ({
    ...version,
    audioFile: null as string | null,
  }))

  for (const entry of versionEntries) {
    if (!entry.localBlobId || !audioFolder) continue
    const blob = await db.audioBlobs.get(entry.localBlobId)
    if (!blob) continue
    const song = songs.find((item) => item.id === entry.songId)
    const extension = blob.blob.type.includes('wav')
      ? '.wav'
      : blob.blob.type.includes('mpeg')
        ? '.mp3'
        : '.m4a'
    const fileName = `${entry.id}-${safeFileName(song?.title ?? entry.label)}${extension}`
    entry.audioFile = `audio/${fileName}`
    audioFolder.file(fileName, blob.blob)
  }

  const manifest = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    columns,
    songs,
    versions: versionEntries,
    links,
    comments,
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const archive = await zip.generateAsync({ type: 'blob' })
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(archive, `memo-backup-${stamp}.zip`)
}
