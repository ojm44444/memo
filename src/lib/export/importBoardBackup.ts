import JSZip from 'jszip'
import { createId } from '@/lib/ids'
import { db } from '@/db/database'
import { enqueueSync } from '@/db/repositories/outboxRepo'
import { createProject, setActiveProjectId } from '@/db/repositories/projectRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { supabase } from '@/lib/supabase/client'
import type { AudioBlob, AudioVersion } from '@/types/audio-version'
import type { Song, SongLink } from '@/types/song'
import type { SongComment } from '@/types/song-comment'
import {
  BACKUP_VERSION,
  type BackupManifest,
  type ImportBackupResult,
  type ImportProgress,
} from './backupTypes'

function guessMime(fileName: string) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  return 'audio/mp4'
}

async function findAudioFileInZip(zip: JSZip, versionId: string, audioFile?: string | null) {
  if (audioFile) {
    const direct = zip.file(audioFile)
    if (direct) return direct
  }

  const matches = Object.keys(zip.files).filter((path) => {
    if (path.endsWith('/')) return false
    const base = path.split('/').pop() ?? ''
    return base.startsWith(`${versionId}-`) || base === versionId
  })

  if (matches.length === 0) return null
  return zip.file(matches[0]!)
}

/**
 * Clear the device and put the backup's projects and columns back, in ONE
 * transaction. They used to be written after the wipe had committed, and in
 * that gap every live query on screen saw a board with no project and made
 * one: a real restore in Chrome left fifteen "My Project"s. Done atomically,
 * nothing ever sees the board empty.
 */
async function wipeBoardForRestore(manifest: BackupManifest) {
  const deviceId = (await db.syncMeta.get('deviceId'))?.value

  await db.transaction(
    'rw',
    [
      db.songs,
      db.audioVersions,
      db.audioBlobs,
      db.songLinks,
      db.songComments,
      db.syncQueue,
      db.columns,
      db.projects,
      db.importedSources,
      db.folderWatch,
      db.syncMeta,
    ],
    async () => {
      await Promise.all([
        db.songs.clear(),
        db.audioVersions.clear(),
        db.audioBlobs.clear(),
        db.songLinks.clear(),
        db.songComments.clear(),
        db.syncQueue.clear(),
        db.columns.clear(),
        db.projects.clear(),
        db.importedSources.clear(),
        db.folderWatch.clear(),
        db.syncMeta.clear(),
      ])

      if (deviceId) await db.syncMeta.put({ key: 'deviceId', value: deviceId })
      await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })

      await db.columns.bulkPut(manifest.columns)
      await db.projects.bulkPut(manifest.projects)
    },
  )
}

async function importAudioVersion(
  zip: JSZip,
  version: BackupManifest['versions'][number],
  songId: string,
  remapIds: boolean,
) {
  const versionId = remapIds ? createId() : version.id
  const audioEntry = await findAudioFileInZip(zip, version.id, version.audioFile)

  let localBlobId: string | null = null
  if (audioEntry) {
    const arrayBuffer = await audioEntry.async('arraybuffer')
    const mimeType = version.mimeType || guessMime(audioEntry.name ?? '')
    const blobId = remapIds ? createId() : version.localBlobId ?? createId()
    const blob: AudioBlob = {
      id: blobId,
      blob: new Blob([arrayBuffer], { type: mimeType }),
      mimeType,
      size: arrayBuffer.byteLength,
      createdAt: version.createdAt,
    }
    await db.audioBlobs.put(blob)
    localBlobId = blobId
  }

  /* Everything the take had, not a hand-picked list. This used to name nine
     fields and drop the rest, so a restore quietly lost every take's tags, its
     trim points and whether it was a take, a mix or a master. Found by the
     round trip test, which is why that test compares whole records. */
  const kept: Partial<BackupManifest['versions'][number]> = { ...version }
  delete kept.audioFile
  const restored: AudioVersion = {
    ...(kept as AudioVersion),
    id: versionId,
    songId,
    localBlobId,
    storagePath: remapIds ? null : version.storagePath,
    recordedAt: version.recordedAt ?? null,
    // The cloud's rules may have changed since (032 widened them), so a take
    // it once refused gets another try from the restored device.
    uploadBlockedReason: null,
    syncedAt: null,
  }

  await db.audioVersions.put(restored)

  if (localBlobId) {
    await enqueueSync('upload', 'audio_version', versionId, {
      versionId,
      songId,
      fileName: version.label,
      mimeType: restored.mimeType,
      durationMs: restored.durationMs,
      sortOrder: restored.sortOrder,
      label: restored.label,
      localBlobId,
    })
  }

  return Boolean(localBlobId)
}

async function importLinks(links: SongLink[], songIdMap: Map<string, string>, remapIds: boolean) {
  let count = 0
  for (const link of links) {
    const songId = songIdMap.get(link.songId) ?? link.songId
    const restored: SongLink = {
      ...link,
      id: remapIds ? createId() : link.id,
      songId,
    }
    await db.songLinks.put(restored)
    await enqueueSync('create', 'song_link', restored.id, restored)
    count++
  }
  return count
}

async function importComments(
  comments: SongComment[],
  songIdMap: Map<string, string>,
  remapIds: boolean,
) {
  const userId = (await supabase?.auth.getUser())?.data.user?.id ?? 'imported'
  let count = 0

  for (const comment of comments) {
    const songId = songIdMap.get(comment.songId) ?? comment.songId
    const restored: SongComment = {
      ...comment,
      id: remapIds ? createId() : comment.id,
      songId,
      userId: remapIds ? userId : comment.userId,
      syncedAt: null,
      deletedAt: null,
    }
    await db.songComments.put(restored)
    await enqueueSync('create', 'song_comment', restored.id, restored)
    count++
  }

  return count
}

async function restoreReplace(
  zip: JSZip,
  manifest: BackupManifest,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportBackupResult> {
  onProgress?.({
    phase: 'metadata',
    done: 0,
    total: manifest.songs.length,
    message: 'Restoring projects and songs…',
  })

  await wipeBoardForRestore(manifest)

  for (const column of manifest.columns) {
    await enqueueSync('create', 'column', column.id, column)
  }

  for (const project of manifest.projects) {
    await enqueueSync('create', 'project', project.id, project)
  }

  const songIdMap = new Map(manifest.songs.map((song) => [song.id, song.id]))

  for (const [index, song] of manifest.songs.entries()) {
    const restored: Song = { ...song, syncedAt: null, deletedAt: null }
    await db.songs.put(restored)
    await enqueueSync('create', 'song', restored.id, restored)
    onProgress?.({
      phase: 'metadata',
      done: index + 1,
      total: manifest.songs.length,
      message: `Restoring songs (${index + 1}/${manifest.songs.length})…`,
    })
  }

  let audioImported = 0
  let audioSkipped = 0
  for (const [index, version] of manifest.versions.entries()) {
    if (await importAudioVersion(zip, version, version.songId, false)) {
      audioImported++
    } else {
      audioSkipped++
    }
    onProgress?.({
      phase: 'audio',
      done: index + 1,
      total: manifest.versions.length,
      message: `Importing audio (${index + 1}/${manifest.versions.length})…`,
    })
  }

  onProgress?.({
    phase: 'finishing',
    done: 1,
    total: 1,
    message: 'Finishing import…',
  })

  const linksImported = await importLinks(manifest.links, songIdMap, false)
  const commentsImported = await importComments(manifest.comments, songIdMap, false)

  if (manifest.projects[0]) {
    await setActiveProjectId(manifest.projects[0].id)
  }

  scheduleFlush()

  return {
    mode: 'replace',
    projectsImported: manifest.projects.length,
    songsImported: manifest.songs.length,
    audioImported,
    audioSkipped,
    linksImported,
    commentsImported,
    exportedAt: manifest.exportedAt,
    projectName: manifest.projects[0]?.name ?? 'Restored board',
  }
}

async function restoreMerge(
  zip: JSZip,
  manifest: BackupManifest,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportBackupResult> {
  onProgress?.({
    phase: 'metadata',
    done: 0,
    total: manifest.songs.length,
    message: 'Creating import project…',
  })

  const importProject = await createProject(
    `Imported ${new Date(manifest.exportedAt).toLocaleDateString()}`,
  )
  const songIdMap = new Map<string, string>()

  for (const [index, song] of manifest.songs.entries()) {
    const existing = await db.songs.get(song.id)
    const newSongId = existing ? createId() : song.id
    songIdMap.set(song.id, newSongId)

    const restored: Song = {
      ...song,
      id: newSongId,
      projectId: importProject.id,
      syncedAt: null,
      deletedAt: null,
    }
    await db.songs.put(restored)
    await enqueueSync('create', 'song', newSongId, restored)
    onProgress?.({
      phase: 'metadata',
      done: index + 1,
      total: manifest.songs.length,
      message: `Adding songs (${index + 1}/${manifest.songs.length})…`,
    })
  }

  let audioImported = 0
  let audioSkipped = 0
  for (const [index, version] of manifest.versions.entries()) {
    const songId = songIdMap.get(version.songId)
    if (!songId) {
      audioSkipped++
      continue
    }
    if (await importAudioVersion(zip, version, songId, true)) {
      audioImported++
    } else {
      audioSkipped++
    }
    onProgress?.({
      phase: 'audio',
      done: index + 1,
      total: manifest.versions.length,
      message: `Importing audio (${index + 1}/${manifest.versions.length})…`,
    })
  }

  onProgress?.({
    phase: 'finishing',
    done: 1,
    total: 1,
    message: 'Finishing import…',
  })

  const linksImported = await importLinks(manifest.links, songIdMap, true)
  const commentsImported = await importComments(manifest.comments, songIdMap, true)

  await setActiveProjectId(importProject.id)
  scheduleFlush()

  return {
    mode: 'merge',
    projectsImported: 1,
    songsImported: manifest.songs.length,
    audioImported,
    audioSkipped,
    linksImported,
    commentsImported,
    exportedAt: manifest.exportedAt,
    projectName: importProject.name,
  }
}

export async function importBoardBackup(
  file: File,
  mode: 'merge' | 'replace',
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportBackupResult> {
  onProgress?.({ phase: 'reading', done: 0, total: 1, message: 'Reading backup…' })

  const zip = await JSZip.loadAsync(file)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('Invalid backup — missing manifest.json')

  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest
  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version (${manifest.version})`)
  }
  if (!manifest.songs?.length) throw new Error('Backup contains no songs')

  onProgress?.({ phase: 'reading', done: 1, total: 1, message: 'Backup validated' })

  if (mode === 'replace') {
    return restoreReplace(zip, manifest, onProgress)
  }

  return restoreMerge(zip, manifest, onProgress)
}
