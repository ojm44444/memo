import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { moveSong } from '@/db/repositories/boardRepo'
import type { Song } from '@/types/song'

/**
 * Regression cover for the append-collision in computeInsertSortOrder.
 *
 * The append branch used to return the COUNT of songs in the column. sortOrder
 * values are not a dense 0..n-1 run (inserts use midpoints, and moving a song
 * out leaves a gap), so count could equal an existing sortOrder. Two songs then
 * tie, and two devices can break the tie differently, which is how column
 * order drifts apart between devices.
 */

function song(id: string, columnSlug: string, sortOrder: number): Song {
  const now = new Date().toISOString()
  return {
    id,
    title: id,
    columnSlug,
    projectId: null,
    tags: [],
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    sortOrder,
    notes: '',
    recordedAt: null,
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
  }
}

async function sortOrdersIn(columnSlug: string) {
  const rows = await db.songs.where('columnSlug').equals(columnSlug).toArray()
  return rows.filter((s) => !s.deletedAt).map((s) => s.sortOrder)
}

describe('append sortOrder', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.syncQueue.clear()
  })

  it('does not collide with an existing sortOrder when the column has gaps', async () => {
    // A gap at 2, exactly what moving a song out of a column leaves behind.
    await db.songs.bulkPut([
      song('a', 'inbox', 0),
      song('b', 'inbox', 1),
      song('c', 'inbox', 3),
    ])
    // The old code returned count === 3 here, tying with song "c".
    await db.songs.put(song('mover', 'ideas', 0))
    await moveSong('mover', 'inbox', 999)

    const orders = await sortOrdersIn('inbox')
    expect(new Set(orders).size).toBe(orders.length)
    expect(Math.max(...orders)).toBe(4)
  })

  it('does not collide when sortOrders are negative from midpoint inserts', async () => {
    // `beforeSong.sortOrder - 1024` produces negatives, so count is unrelated
    // to the real range.
    await db.songs.bulkPut([song('a', 'inbox', -1024), song('b', 'inbox', 0)])
    await db.songs.put(song('mover', 'ideas', 0))
    await moveSong('mover', 'inbox', 999)

    const orders = await sortOrdersIn('inbox')
    expect(new Set(orders).size).toBe(orders.length)
    expect(Math.max(...orders)).toBe(1)
  })

  it('starts at 0 in an empty column', async () => {
    await db.songs.put(song('mover', 'ideas', 5))
    await moveSong('mover', 'inbox', 999)
    expect(await sortOrdersIn('inbox')).toEqual([0])
  })

  it('enqueues the moved song so the move actually syncs', async () => {
    await db.songs.put(song('mover', 'ideas', 0))
    await moveSong('mover', 'inbox', 999)

    const queued = await db.syncQueue.where('entityId').equals('mover').toArray()
    expect(queued.length).toBeGreaterThan(0)
    expect(queued[0].entityType).toBe('song')
  })
})
