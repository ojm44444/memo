import Dexie, { type EntityTable } from 'dexie'
import type { AudioBlob, AudioVersion } from '@/types/audio-version'
import type { Column } from '@/types/column'
import type { FolderWatch, ImportedSource } from '@/types/folder-watch'
import type { Project } from '@/types/project'
import type { SongComment } from '@/types/song-comment'
import type { Song, SongLink } from '@/types/song'
import type { SyncQueueItem } from '@/types/sync'

export interface SyncMeta {
  key: string
  value: string
}

export class MemoDatabase extends Dexie {
  columns!: EntityTable<Column, 'id'>
  songs!: EntityTable<Song, 'id'>
  audioVersions!: EntityTable<AudioVersion, 'id'>
  audioBlobs!: EntityTable<AudioBlob, 'id'>
  songLinks!: EntityTable<SongLink, 'id'>
  songComments!: EntityTable<SongComment, 'id'>
  projects!: EntityTable<Project, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'key'>
  folderWatch!: EntityTable<FolderWatch, 'key'>
  importedSources!: EntityTable<ImportedSource, 'sourceKey'>

  constructor() {
    super('memo')

    this.version(1).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, sortOrder, updatedAt, deletedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
    })

    this.version(2).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, sortOrder, updatedAt, deletedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
      folderWatch: 'key',
      importedSources: 'sourceKey, importedAt',
    })

    this.version(3).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, projectId, sortOrder, updatedAt, deletedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      projects: 'id, sortOrder',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
      folderWatch: 'key',
      importedSources: 'sourceKey, importedAt',
    })

    this.version(3).upgrade(async (tx) => {
      const { createId } = await import('@/lib/ids')
      const defaultProjectId = createId()
      const now = new Date().toISOString()

      await tx.table('projects').add({
        id: defaultProjectId,
        name: 'My Project',
        sortOrder: 0,
        createdAt: now,
      })

      await tx.table('syncMeta').put({ key: 'activeProjectId', value: defaultProjectId })

      const songs = await tx.table('songs').toArray()
      for (const song of songs) {
        await tx.table('songs').update(song.id, {
          projectId: defaultProjectId,
          tags: song.tags ?? [],
        })
      }
    })

    this.version(4).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, projectId, isFavourite, sortOrder, updatedAt, deletedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      projects: 'id, sortOrder',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
      folderWatch: 'key',
      importedSources: 'sourceKey, importedAt',
    })

    this.version(4).upgrade(async (tx) => {
      const songs = await tx.table('songs').toArray()
      for (const song of songs) {
        await tx.table('songs').update(song.id, {
          isFavourite: song.isFavourite ?? false,
          musicalKey: song.musicalKey ?? null,
          bpm: song.bpm ?? null,
        })
      }
    })

    this.version(5).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, projectId, isFavourite, sortOrder, updatedAt, deletedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      songComments: 'id, songId, userId, createdAt, deletedAt',
      projects: 'id, sortOrder',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
      folderWatch: 'key',
      importedSources: 'sourceKey, importedAt',
    })

    this.version(6).stores({
      columns: 'id, slug, sortOrder',
      songs: 'id, columnSlug, projectId, isFavourite, sortOrder, updatedAt, deletedAt, recordedAt',
      audioVersions: 'id, songId, sortOrder, localBlobId, storagePath, recordedAt',
      audioBlobs: 'id',
      songLinks: 'id, songId',
      songComments: 'id, songId, userId, createdAt, deletedAt',
      projects: 'id, sortOrder',
      syncQueue: 'id, entityType, entityId, createdAt',
      syncMeta: 'key',
      folderWatch: 'key',
      importedSources: 'sourceKey, importedAt',
    })

    this.version(6).upgrade(async (tx) => {
      await tx.table('songs').toCollection().modify((song) => {
        if (!('recordedAt' in song)) song.recordedAt = null
      })
      await tx.table('audioVersions').toCollection().modify((version) => {
        if (!('recordedAt' in version)) version.recordedAt = null
      })
    })
  }
}

export const db = new MemoDatabase()
