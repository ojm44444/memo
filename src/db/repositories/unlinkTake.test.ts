import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { mergeSongsInto, unlinkTake } from '@/db/repositories/boardRepo'
import type { Song } from '@/types/song'
import type { AudioVersion } from '@/types/audio-version'

/**
 * Unlink puts a merged take back on its own card (Owen, 18 Sept: "you should
 * unlink it and then make it put back on the thing"). When the song it came
 * from is still there, that song comes back with its column and tags. When
 * it is not, the take gets a new card beside the song it was linked to.
 */

const now = new Date().toISOString()

function song(id: string, title: string, columnSlug = 'ideas', tags: string[] = []): Song {
  return {
    id,
    title,
    columnSlug,
    projectId: null,
    tags,
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    sortOrder: 0,
    notes: '',
    recordedAt: null,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
  }
}

function take(id: string, songId: string, sortOrder: number, label = id): AudioVersion {
  return {
    id,
    songId,
    label,
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

describe('unlinkTake', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.audioVersions.clear()
    await db.songLinks.clear()
    await db.syncQueue.clear()
    await db.columns.clear()
    await db.columns.bulkPut([
      { id: 'c1', slug: 'ideas', title: 'Ideas', sortOrder: 0 },
      { id: 'c2', slug: 'half-done', title: 'Half done', sortOrder: 1 },
    ])

    await db.songs.bulkPut([
      song('sad-piano', 'Sad piano riff', 'ideas'),
      song('all-my-life', 'All of my life', 'half-done', ['Chorus']),
    ])
    await db.audioVersions.bulkPut([
      take('piano-take', 'sad-piano', 0),
      take('life-take', 'all-my-life', 0),
    ])
  })

  it('brings the original song back, in its own column, with its tags', async () => {
    await mergeSongsInto('sad-piano', ['all-my-life'])
    expect((await db.songs.get('all-my-life'))?.deletedAt).not.toBeNull()

    const landed = await unlinkTake('life-take')

    expect(landed?.id).toBe('all-my-life')
    const restored = await db.songs.get('all-my-life')
    expect(restored?.deletedAt).toBeNull()
    expect(restored?.columnSlug).toBe('half-done')
    expect(restored?.tags).toEqual(['Chorus'])
    expect((await db.audioVersions.get('life-take'))?.songId).toBe('all-my-life')
    const onTarget = await db.audioVersions.where('songId').equals('sad-piano').toArray()
    expect(onTarget.map((v) => v.id)).toEqual(['piano-take'])
  })

  it('finds the original of an older merge by name', async () => {
    await mergeSongsInto('sad-piano', ['all-my-life'])
    // An older merge never recorded where the take came from.
    await db.audioVersions.update('life-take', { label: 'All of my life', mergedFromSongId: undefined })

    const landed = await unlinkTake('life-take')

    expect(landed?.id).toBe('all-my-life')
    expect((await db.songs.get('all-my-life'))?.deletedAt).toBeNull()
  })

  it('makes a new card in the same column when there is nothing to go back to', async () => {
    await db.audioVersions.put(take('extra-take', 'sad-piano', 1, 'Second go'))

    const landed = await unlinkTake('extra-take')

    expect(landed).not.toBeNull()
    expect(landed?.id).not.toBe('sad-piano')
    expect(landed?.columnSlug).toBe('ideas')
    expect(landed?.title).toBe('Second go')
    expect((await db.audioVersions.get('extra-take'))?.songId).toBe(landed?.id)
  })

  it('does nothing to a song\'s only take', async () => {
    expect(await unlinkTake('piano-take')).toBeNull()
    expect((await db.audioVersions.get('piano-take'))?.songId).toBe('sad-piano')
  })
})
