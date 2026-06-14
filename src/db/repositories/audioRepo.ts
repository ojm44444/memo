import { createId } from '@/lib/ids'
import { getAudioDuration } from '@/lib/audio-utils'
import type { AudioBlob, AudioVersion } from '@/types/audio-version'
import type { ColumnSlug } from '@/types/column'
import type { Song, SongLink } from '@/types/song'
import { db } from '../database'
import { extractFileMetadata, type AudioFileMetadata } from '@/lib/audio/extractFileMetadata'
import { smartTitleFromFileName } from '@/lib/audio/smartTitle'
import { supabase } from '@/lib/supabase/client'
import { createSong, getSong, updateSong } from './boardRepo'
import { enqueueSync } from './outboxRepo'

export async function getAudioVersions(songId: string) {
  return db.audioVersions.where('songId').equals(songId).sortBy('sortOrder')
}

export async function getAudioBlob(blobId: string) {
  return db.audioBlobs.get(blobId)
}

async function applySongMetadataFromFile(songId: string, metadata: AudioFileMetadata) {
  const song = await getSong(songId)
  if (!song) return

  const patch: { musicalKey?: string | null; bpm?: number | null } = {}
  if (!song.musicalKey && metadata.musicalKey) patch.musicalKey = metadata.musicalKey
  if (!song.bpm && metadata.bpm) patch.bpm = metadata.bpm
  if (Object.keys(patch).length > 0) await updateSong(songId, patch)
}

export async function addAudioVersionToSong(
  songId: string,
  file: File,
  label?: string,
  fileMetadata?: AudioFileMetadata,
) {
  const versions = await getAudioVersions(songId)
  const blobId = createId()
  const versionId = createId()
  const now = new Date().toISOString()
  const durationMs = await getAudioDuration(file)

  const blob: AudioBlob = {
    id: blobId,
    blob: file,
    mimeType: file.type || 'audio/mpeg',
    size: file.size,
    createdAt: now,
  }

  const metadata = fileMetadata ?? (await extractFileMetadata(file))

  const version: AudioVersion = {
    id: versionId,
    songId,
    label: label ?? file.name.replace(/\.[^.]+$/, ''),
    durationMs,
    mimeType: blob.mimeType,
    sortOrder: versions.length,
    localBlobId: blobId,
    storagePath: null,
    recordedAt: metadata.recordedAt ?? null,
    createdAt: now,
    syncedAt: null,
  }

  await db.transaction('rw', db.audioBlobs, db.audioVersions, async () => {
    await db.audioBlobs.add(blob)
    await db.audioVersions.add(version)
  })

  await enqueueSync('upload', 'audio_version', versionId, {
    versionId,
    songId,
    fileName: file.name,
    mimeType: blob.mimeType,
    durationMs,
    sortOrder: version.sortOrder,
    label: version.label,
    localBlobId: blobId,
  })

  await applySongMetadataFromFile(songId, metadata)

  return version
}

export type ImportAudioResult = {
  versions: AudioVersion[]
  /** File names skipped because they match an existing import (same name + size). */
  duplicates: string[]
}

async function findDuplicateImport(file: File): Promise<boolean> {
  const fileStem = file.name.replace(/\.[^.]+$/, '')
  const blobs = await db.audioBlobs.where('size').equals(file.size).toArray()

  for (const blob of blobs) {
    const version = await db.audioVersions.where('localBlobId').equals(blob.id).first()
    if (!version) continue
    if (version.label !== fileStem && version.label !== file.name) continue
    const song = await db.songs.get(version.songId)
    if (song && !song.deletedAt) return true
  }

  return false
}

export async function importAudioFiles(
  files: File[],
  columnSlug: ColumnSlug = 'inbox',
): Promise<ImportAudioResult> {
  const versions: AudioVersion[] = []
  const duplicates: string[] = []

  for (const file of files) {
    if (await findDuplicateImport(file)) {
      duplicates.push(file.name)
      continue
    }

    const metadata = await extractFileMetadata(file)
    const title = metadata.title || smartTitleFromFileName(file.name)
    const song = await createSong({
      title,
      columnSlug,
      musicalKey: metadata.musicalKey,
      bpm: metadata.bpm,
      recordedAt: metadata.recordedAt,
    })
    const version = await addAudioVersionToSong(song.id, file, undefined, metadata)
    versions.push(version)
  }

  return { versions, duplicates }
}

export async function updateAudioVersionStoragePath(
  versionId: string,
  storagePath: string,
) {
  const version = await db.audioVersions.get(versionId)
  if (!version) return

  await db.audioVersions.update(versionId, {
    storagePath,
    syncedAt: new Date().toISOString(),
  })
}

export async function getPrimaryVersionForSong(songId: string) {
  const versions = await getAudioVersions(songId)
  return versions[0] ?? null
}

export async function renameAudioVersion(versionId: string, label: string) {
  const version = await db.audioVersions.get(versionId)
  if (!version) return null

  const trimmed = label.trim()
  if (!trimmed) throw new Error('Clip name is required')

  await db.audioVersions.update(versionId, { label: trimmed })
  await enqueueSync('update', 'audio_version', versionId, {
    ...version,
    label: trimmed,
  })
  return { ...version, label: trimmed }
}

export async function setPrimaryVersion(songId: string, versionId: string) {
  const versions = await getAudioVersions(songId)
  const index = versions.findIndex((version) => version.id === versionId)
  if (index <= 0) return versions

  const reordered = [...versions]
  const [picked] = reordered.splice(index, 1)
  reordered.unshift(picked)

  await db.transaction('rw', db.audioVersions, async () => {
    for (let i = 0; i < reordered.length; i++) {
      await db.audioVersions.update(reordered[i].id, { sortOrder: i })
      await enqueueSync('update', 'audio_version', reordered[i].id, {
        ...reordered[i],
        sortOrder: i,
      })
    }
  })

  return reordered
}

async function cloneBlobRecord(source: AudioBlob) {
  const blobId = createId()
  const now = new Date().toISOString()
  const data = source.blob
  const cloned =
    data instanceof File
      ? new File([data], data.name, { type: data.type || source.mimeType })
      : new Blob([data], { type: source.mimeType })

  const record: AudioBlob = {
    id: blobId,
    blob: cloned,
    mimeType: source.mimeType,
    size: cloned.size,
    createdAt: now,
  }

  await db.audioBlobs.add(record)
  return record
}

async function resolveVersionBlob(version: AudioVersion) {
  if (version.localBlobId) {
    return getAudioBlob(version.localBlobId)
  }

  if (!version.storagePath || !supabase) return null

  const { data, error } = await supabase.storage.from('audio').download(version.storagePath)
  if (error || !data) return null

  return {
    id: 'temp',
    blob: data,
    mimeType: version.mimeType || data.type || 'audio/mp4',
    size: data.size,
    createdAt: new Date().toISOString(),
  } satisfies AudioBlob
}

export type DuplicateSongResult = {
  song: Song
  clipsCopied: number
  clipsSkipped: number
}

export type DuplicateSongOptions = {
  projectId?: string
  title?: string
}

export async function duplicateSong(
  songId: string,
  options?: DuplicateSongOptions,
): Promise<DuplicateSongResult> {
  const song = await getSong(songId)
  if (!song || song.deletedAt) throw new Error('Song not found')

  const versions = await getAudioVersions(songId)
  const links = await db.songLinks.where('songId').equals(songId).toArray()

  const copy = await createSong({
    title: options?.title ?? `${song.title} (copy)`,
    columnSlug: song.columnSlug,
    notes: song.notes,
    tags: [...(song.tags ?? [])],
    projectId: options?.projectId ?? song.projectId ?? undefined,
    musicalKey: song.musicalKey,
    bpm: song.bpm,
  })

  let clipsCopied = 0
  let clipsSkipped = 0

  for (const version of versions) {
    const sourceBlob = await resolveVersionBlob(version)
    if (!sourceBlob) {
      clipsSkipped++
      continue
    }

    const clonedBlob = await cloneBlobRecord(sourceBlob)
    const versionId = createId()
    const now = new Date().toISOString()

    const nextVersion: AudioVersion = {
      id: versionId,
      songId: copy.id,
      label: version.label,
      durationMs: version.durationMs,
      mimeType: version.mimeType,
      sortOrder: version.sortOrder,
      localBlobId: clonedBlob.id,
      storagePath: null,
      recordedAt: version.recordedAt ?? null,
      createdAt: now,
      syncedAt: null,
    }

    await db.audioVersions.add(nextVersion)
    await enqueueSync('upload', 'audio_version', versionId, {
      versionId,
      songId: copy.id,
      fileName: `${version.label}.audio`,
      mimeType: clonedBlob.mimeType,
      durationMs: version.durationMs,
      sortOrder: version.sortOrder,
      label: version.label,
      localBlobId: clonedBlob.id,
    })
    clipsCopied++
  }

  for (const link of links) {
    const restored: SongLink = {
      id: createId(),
      songId: copy.id,
      url: link.url,
      label: link.label,
      createdAt: new Date().toISOString(),
    }
    await db.songLinks.add(restored)
    await enqueueSync('create', 'song_link', restored.id, restored)
  }

  return { song: copy, clipsCopied, clipsSkipped }
}

export async function deleteAudioVersion(versionId: string) {
  const version = await db.audioVersions.get(versionId)
  if (!version) return

  const versions = await getAudioVersions(version.songId)
  if (versions.length <= 1) throw new Error('Keep at least one clip on this song')

  await db.audioVersions.delete(versionId)
  if (version.localBlobId) {
    const stillUsed = await db.audioVersions
      .where('localBlobId')
      .equals(version.localBlobId)
      .count()
    if (stillUsed === 0) await db.audioBlobs.delete(version.localBlobId)
  }

  const remaining = versions.filter((entry) => entry.id !== versionId)
  for (let i = 0; i < remaining.length; i++) {
    await db.audioVersions.update(remaining[i].id, { sortOrder: i })
    await enqueueSync('update', 'audio_version', remaining[i].id, {
      ...remaining[i],
      sortOrder: i,
    })
  }

  await enqueueSync('delete', 'audio_version', versionId, { id: versionId, songId: version.songId })
}
