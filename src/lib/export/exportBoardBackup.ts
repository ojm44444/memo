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

/* The zip is also the thing you open in Finder the day the service is gone,
   so each file needs an extension that opens it. Everything used to be
   called .m4a unless it was WAV or MP3, so an AIFF or a FLAC came out of the
   backup with the wrong name. The restore reads the type from the manifest
   either way; this is for the person, not for the import. */
const EXTENSIONS: Array<[string, string]> = [
  ['wav', '.wav'],
  ['wave', '.wav'],
  ['mpeg', '.mp3'],
  ['mp3', '.mp3'],
  ['aiff', '.aiff'],
  ['x-caf', '.caf'],
  ['flac', '.flac'],
  ['ogg', '.ogg'],
  ['opus', '.opus'],
  ['webm', '.webm'],
  ['amr', '.amr'],
  ['3gpp', '.3gp'],
  ['aac', '.aac'],
  ['quicktime', '.mov'],
  ['video/mp4', '.mp4'],
]

function extensionFor(mimeType: string) {
  const type = mimeType.toLowerCase()
  return EXTENSIONS.find(([needle]) => type.includes(needle))?.[1] ?? '.m4a'
}

const version = (entry: { mimeType?: string }) => entry.mimeType ?? ''

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_').trim() || 'audio'
}

/**
 * The backup as a zip, without saving it anywhere. Split from the download so
 * the round trip can be tested: a backup nobody has restored from is not a
 * backup (see backupRoundTrip.test.ts).
 */
export async function buildBoardBackup(): Promise<Blob> {
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
    const extension = extensionFor(blob.mimeType || blob.blob.type || version(entry))
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

  return zip.generateAsync({ type: 'blob' })
}

export async function exportBoardBackup() {
  const archive = await buildBoardBackup()
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(archive, `songdrafts-backup-${stamp}.zip`)
}
