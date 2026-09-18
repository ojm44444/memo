import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import type { Song } from '@/types/song'
import { enqueueSync } from './outboxRepo'
import { integerBetween, repairFractionalSortOrders, toCloudPosition } from './songOrder'
import { friendlySyncError } from '@/sync/friendlySyncError'

/**
 * The "Syntax error" in the sync badge (18 Sept 2026). A drag between two
 * cards stored a fractional position, songs.position is an integer, and
 * Postgres refused it on every sync: invalid input syntax for type integer.
 */

function song(id: string, sortOrder: number, extra: Partial<Song> = {}): Song {
  const now = new Date().toISOString()
  return {
    id,
    title: id,
    columnSlug: 'writing',
    projectId: 'p1',
    tags: [],
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    recordedAt: null,
    sortOrder,
    notes: '',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
    ...extra,
  } as Song
}

describe('song order is always a whole number', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.syncQueue.clear()
  })

  it('finds a whole number between neighbours, or none', () => {
    expect(integerBetween(0, 1024)).toBe(512)
    expect(integerBetween(3, 4)).toBeNull()
    expect(integerBetween(-2046, -2045)).toBeNull()
    expect(Number.isInteger(integerBetween(-3000, -1000))).toBe(true)
  })

  it('never sends a fraction to the cloud', () => {
    expect(toCloudPosition(-2045.5)).toBe(-2045)
    expect(toCloudPosition(3)).toBe(3)
    expect(toCloudPosition(undefined)).toBeUndefined()
  })

  it('reorder between adjacent cards renumbers instead of storing 3.5', async () => {
    await db.songs.bulkAdd([song('a', 3), song('b', 4), song('c', 5)])
    const { reorderSongInColumn } = await import('./boardRepo')
    await reorderSongInColumn('c', 'writing', 1, 'b')
    const ordered = await db.songs.orderBy('sortOrder').toArray()
    expect(ordered.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    expect(ordered.every((s) => Number.isInteger(s.sortOrder))).toBe(true)
    const queued = await db.syncQueue.toArray()
    for (const item of queued) {
      const payload = JSON.parse(item.payload) as { sortOrder?: number }
      if (payload.sortOrder !== undefined) expect(Number.isInteger(payload.sortOrder)).toBe(true)
    }
  })

  it('repairs fractional orders left from before the fix', async () => {
    await db.songs.bulkAdd([song('a', -2045.5), song('b', 0), song('c', 0.5)])
    await enqueueSync('update', 'song', 'a', { sortOrder: -2045.5, title: 'kept' })
    await repairFractionalSortOrders()
    const all = await db.songs.toArray()
    expect(all.every((s) => Number.isInteger(s.sortOrder))).toBe(true)
    const [item] = await db.syncQueue.where('entityId').equals('a').toArray()
    const payload = JSON.parse(item.payload) as { sortOrder: number; title?: string }
    expect(Number.isInteger(payload.sortOrder)).toBe(true)
    // Merged, not replaced: the queued title edit survives the renumber.
    expect(payload.title).toBe('kept')
  })
})

describe('sync badge text', () => {
  it('never shows the raw database message', () => {
    expect(friendlySyncError('invalid input syntax for type integer: "-2045.5"')).toBe(
      'Sync problem. Tap to retry.',
    )
    expect(friendlySyncError("SyntaxError: Unexpected token '<'")).toBe('Sync problem. Tap to retry.')
    expect(friendlySyncError('TypeError: Failed to fetch')).toBe("Can't reach the cloud. Saved here.")
    expect(friendlySyncError('3 uploads not finished. Tap to retry')).toBe('3 not synced yet. Tap to retry.')
    expect(friendlySyncError(null)).toBeNull()
  })
})
