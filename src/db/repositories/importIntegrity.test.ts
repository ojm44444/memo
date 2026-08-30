import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/database'

/**
 * Regression cover for the failure that put orphan cards on Owen's real board.
 *
 * importAudioFiles created the song first and synced it immediately, then
 * added the take. When that second step threw - a non-audio file, a decode
 * failure, a storage error - the song survived with no audio. On a board of
 * unreleased songs, a card whose music is missing is indistinguishable from
 * lost music, which is the worst thing this product can do to someone.
 *
 * "Export" and "IMG 2085" on the production board are exactly this.
 */

vi.mock('@/lib/audio/extractFileMetadata', () => ({
  extractFileMetadata: async () => ({
    musicalKey: null,
    bpm: null,
    recordedAt: null,
    title: null,
  }),
}))

// The take step throws, which is the whole point of the test.
vi.mock('@/db/repositories/audioVersionCreate', () => ({}))

describe('import integrity', () => {
  beforeEach(async () => {
    await db.songs.clear()
    await db.audioVersions.clear()
    await db.syncQueue?.clear?.()
  })

  it('refuses a zero-byte file without creating a card', async () => {
    const { importAudioFiles } = await import('@/db/repositories/audioRepo')

    const before = await db.songs.count()
    const result = await importAudioFiles(
      [new File([], 'IMG_2085.mov', { type: 'video/quicktime' })],
      'inbox',
    )
    const after = await db.songs.count()

    expect(after).toBe(before)
    expect(result.versions).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].name).toBe('IMG_2085.mov')
  })

  it('detects a card that has lost its take', async () => {
    // The state Owen actually has on production: "Export" and "IMG 2085",
    // songs whose import failed half-way before import was made atomic.
    const now = new Date().toISOString()
    await db.songs.add({
      id: 'orphan-1',
      title: 'Export',
      columnSlug: 'inbox',
      sortOrder: 0,
      notes: '',
      tags: [],
      isFavourite: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as never)

    const { findSongsWithoutTakes } = await import('@/db/repositories/integrityRepo')
    const orphans = await findSongsWithoutTakes()

    expect(orphans.map((o) => o.title)).toContain('Export')
  })

  it('does not report a song whose take exists', async () => {
    const now = new Date().toISOString()
    await db.songs.add({
      id: 'song-ok',
      title: 'car park chorus',
      columnSlug: 'inbox',
      sortOrder: 0,
      notes: '',
      tags: [],
      isFavourite: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as never)
    await db.audioVersions.add({
      id: 'v1',
      songId: 'song-ok',
      label: 'take 1',
      fileName: 'a.m4a',
      durationMs: 0, // unknown duration is NOT missing audio
      sortOrder: 0,
      storagePath: 'user/board/song-ok/v1.m4a',
      createdAt: now,
    } as never)

    const { findSongsWithoutTakes, findUnrecoverableVersions } = await import(
      '@/db/repositories/integrityRepo'
    )

    expect((await findSongsWithoutTakes()).map((o) => o.title)).not.toContain('car park chorus')
    // A take with a cloud path is safe even with no local blob: it just has
    // not been downloaded to this device yet. Reporting it as loss would be
    // the same mistake as the "no audio" label.
    expect(await findUnrecoverableVersions()).toHaveLength(0)
  })
})
