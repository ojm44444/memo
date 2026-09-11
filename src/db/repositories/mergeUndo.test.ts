import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { mergeSongsInto, undoMerge } from '@/db/repositories/boardRepo'
import type { Song } from '@/types/song'
import type { AudioVersion } from '@/types/audio-version'

/**
 * Merge has to be reversible, exactly.
 *
 * On 8 Sept an ordinary drag merged "All of my life I have been waiting" into
 * "Sad piano riff": its take moved, the song went to the trash, and its card
 * came back reading "No take on this one yet". The recording survived, but
 * nothing could put it back. These tests hold undoMerge to restoring the
 * source song, returning its own takes to it in their original order, and
 * leaving the target exactly as it was, notes included.
 */

const now = new Date().toISOString()

function song(id: string, title: string, notes = ''): Song {
  return {
    id,
    title,
    columnSlug: 'ideas',
    projectId: null,
    tags: [],
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    sortOrder: 0,
    notes,
    recordedAt: null,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
  }
}

function take(id: string, songId: string, sortOrder: number): AudioVersion {
  return {
    id,
    songId,
    label: id,
    durationMs: 18_000,
    mimeType: 'audio/mp4',
    sortOrder,
    localBlobId: null,
    storagePath: `path/${id}.m4a`,
    recordedAt: null,
    createdAt: now,
    syncedAt: null,
  }
}

describe('mergeSongsInto + undoMerge', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.audioVersions.clear()
    await db.songLinks.clear()
    await db.syncQueue.clear()

    await db.songs.bulkPut([
      song('sad-piano', 'Sad piano riff', 'target notes'),
      song('all-my-life', 'All of my life I have been waiting', 'source notes'),
    ])
    await db.audioVersions.bulkPut([
      take('piano-take', 'sad-piano', 0),
      take('life-take-a', 'all-my-life', 0),
      take('life-take-b', 'all-my-life', 1),
    ])
  })

  it('returns a record naming what moved', async () => {
    const record = await mergeSongsInto('sad-piano', ['all-my-life'])

    expect(record?.targetTitle).toBe('Sad piano riff')
    expect(record?.sources).toHaveLength(1)
    expect(record?.sources[0].sourceTitle).toBe('All of my life I have been waiting')
    expect(record?.sources[0].versions.map((v) => v.id)).toEqual(['life-take-a', 'life-take-b'])
  })

  it('puts every take back on its own song, in its original order', async () => {
    const record = await mergeSongsInto('sad-piano', ['all-my-life'])
    expect((await db.audioVersions.get('life-take-a'))?.songId).toBe('sad-piano')

    await undoMerge(record!)

    const a = await db.audioVersions.get('life-take-a')
    const b = await db.audioVersions.get('life-take-b')
    expect(a?.songId).toBe('all-my-life')
    expect(b?.songId).toBe('all-my-life')
    expect([a?.sortOrder, b?.sortOrder]).toEqual([0, 1])
    // The target keeps only what it had.
    const onTarget = await db.audioVersions.where('songId').equals('sad-piano').toArray()
    expect(onTarget.map((v) => v.id)).toEqual(['piano-take'])
  })

  it('brings the source song back out of the trash', async () => {
    const record = await mergeSongsInto('sad-piano', ['all-my-life'])
    expect((await db.songs.get('all-my-life'))?.deletedAt).not.toBeNull()

    await undoMerge(record!)

    expect((await db.songs.get('all-my-life'))?.deletedAt).toBeNull()
  })

  it('restores the target\'s notes to what they were before the merge', async () => {
    const record = await mergeSongsInto('sad-piano', ['all-my-life'])
    expect((await db.songs.get('sad-piano'))?.notes).toContain('source notes')

    await undoMerge(record!)

    expect((await db.songs.get('sad-piano'))?.notes).toBe('target notes')
  })

  it('queues the undo for sync, so it reaches the cloud the way the merge did', async () => {
    const record = await mergeSongsInto('sad-piano', ['all-my-life'])
    await db.syncQueue.clear()

    await undoMerge(record!)

    const queued = await db.syncQueue.toArray()
    const versionMoves = queued.filter((q) => q.entityType === 'audio_version')
    const songRestore = queued.find((q) => q.entityType === 'song' && q.entityId === 'all-my-life')
    expect(versionMoves.map((q) => q.entityId).sort()).toEqual(['life-take-a', 'life-take-b'])
    expect(songRestore).toBeDefined()
  })
})
