import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { liveQuery } from 'dexie'
import { db } from '@/db/database'
import { deleteSong, getSongsByColumn, mergeSongsInto } from '@/db/repositories/boardRepo'
import type { Song } from '@/types/song'

/**
 * The board must notice when a song leaves a column.
 *
 * getSongsInColumnScope used to await the active project before reading the
 * songs, and Dexie lost the context it uses to record a live query's reads
 * somewhere in that chain. The songs read went unrecorded, so a column's
 * useLiveQuery was never told when one of its songs was deleted or merged
 * away. The card stayed on screen, and after a merge it read "No take on
 * this one yet", which is how a moved recording looked like a destroyed one.
 */

const now = new Date().toISOString()
const song = (id: string, title: string): Song => ({
  id, title, columnSlug: 'ideas', projectId: null, tags: [], isFavourite: false,
  musicalKey: null, bpm: null, sortOrder: 0, notes: '', recordedAt: null,
  createdAt: now, updatedAt: now, syncedAt: null, deletedAt: null,
})

/** Subscribe, run the action, and return every list the column emitted. */
async function emissionsAround(action: () => Promise<unknown>) {
  const seen: string[][] = []
  const sub = liveQuery(() => getSongsByColumn('ideas')).subscribe({
    next: (songs) => seen.push(songs.map((s) => s.title)),
  })
  await new Promise((r) => setTimeout(r, 50))
  await action()
  await new Promise((r) => setTimeout(r, 150))
  sub.unsubscribe()
  return seen
}

describe('column live query', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.audioVersions.clear()
    await db.syncMeta.clear()
    await db.projects.clear()
    await db.projects.add({ id: 'p1', name: 'My Project', sortOrder: 0, createdAt: now })
    await db.syncMeta.put({ key: 'activeProjectId', value: 'p1' })
    await db.songs.bulkPut([song('a', 'All of my life'), song('b', 'Sad piano riff')])
  })

  it('drops a deleted song from the column', async () => {
    const seen = await emissionsAround(() => deleteSong('a'))
    expect(seen.at(-1)).toEqual(['Sad piano riff'])
  })

  it('drops a song that was merged away, instead of leaving an empty ghost', async () => {
    const seen = await emissionsAround(() => mergeSongsInto('b', ['a']))
    expect(seen.at(-1)).toEqual(['Sad piano riff'])
  })
})
