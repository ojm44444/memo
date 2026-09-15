// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/database'

/**
 * A backup nobody has restored from is not a backup.
 *
 * Asked for on 15 Sept, after Samply went offline with a security incident:
 * the one thing that saves a songwriter when the service is gone is the zip
 * in Settings, and until now nothing had ever proved it restores. This does
 * the whole trip on real code: build the zip from a board, wipe the device,
 * restore from the zip, and compare every record and every byte of audio.
 *
 * It found a bug the first time it ran: the restore rebuilt each take from a
 * hand-picked list of nine fields and dropped the rest, so per-take tags,
 * trim points and the take/mix/master label were lost on every restore.
 */

vi.mock('@/sync/syncEngine', () => ({ scheduleFlush: vi.fn(), flush: vi.fn() }))

/* Runs in the node environment because jsdom's Blob does not survive
   IndexedDB's structured clone (it comes back with no type and no bytes),
   which would test the harness rather than the backup. Node's Blob does.
   JSZip reads Blobs through FileReader, which is a browser API node lacks,
   so here is the smallest one that does what JSZip asks of it. */
if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | null = null
    onload: ((event: { target: NodeFileReader }) => void) | null = null
    onerror: ((error: unknown) => void) | null = null
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then(
        (buffer) => {
          this.result = buffer
          this.onload?.({ target: this })
        },
        (error) => this.onerror?.(error),
      )
    }
  }
  ;(globalThis as { FileReader?: unknown }).FileReader = NodeFileReader
}

const now = '2026-09-15T10:00:00.000Z'

function bytes(seed: number, length: number) {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (seed * 31 + i * 7) % 256
  return out
}

async function sha(blob: Blob) {
  const buffer = await new Response(blob).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Buffer.from(digest).toString('hex')
}

async function wipeDevice() {
  await Promise.all([
    db.projects.clear(),
    db.columns.clear(),
    db.songs.clear(),
    db.audioVersions.clear(),
    db.audioBlobs.clear(),
    db.songLinks.clear(),
    db.songComments.clear(),
    db.syncQueue.clear(),
  ])
}

async function seedBoard() {
  await db.projects.put({ id: 'p1', name: 'Album two', sortOrder: 0, createdAt: now })
  await db.columns.bulkPut([
    { id: 'c1', slug: 'inbox', title: 'Inbox', sortOrder: 0 },
    { id: 'c2', slug: 'half-written', title: 'Half written', sortOrder: 1 },
  ])

  const song = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    id,
    title,
    columnSlug: 'half-written',
    projectId: 'p1',
    tags: ['chorus'],
    isFavourite: false,
    musicalKey: 'Am',
    tuning: 'DADGAD',
    bpm: 92,
    sortOrder: 1,
    notes: 'second verse is weak',
    lyrics: 'Am        F\n  field in Wales with one bar',
    recordedAt: now,
    locationName: 'Route de Chabanais 5',
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
    deletedAt: null,
    ...extra,
  })
  await db.songs.bulkPut([
    song('s1', 'car park chorus'),
    song('s2', 'New Recording 47', { isFavourite: true, tags: [] }),
  ])

  const takes = [
    { id: 'v1', songId: 's1', mime: 'audio/mp4', size: 4096, kind: 'take', tags: ['riff'], trimStartMs: 1200 },
    { id: 'v2', songId: 's1', mime: 'audio/wav', size: 8192, kind: 'mix', tags: [], trimEndMs: 60_000 },
    { id: 'v3', songId: 's2', mime: 'audio/aiff', size: 2048, kind: 'master', tags: ['demo'] },
  ] as const
  for (const [i, t] of takes.entries()) {
    await db.audioBlobs.put({
      id: `b-${t.id}`,
      blob: new Blob([bytes(i + 1, t.size)], { type: t.mime }),
      mimeType: t.mime,
      size: t.size,
      createdAt: now,
    })
    await db.audioVersions.put({
      id: t.id,
      songId: t.songId,
      label: `Take ${i + 1}`,
      durationMs: 30_000 + i,
      mimeType: t.mime,
      sortOrder: i,
      localBlobId: `b-${t.id}`,
      storagePath: `owner/board/${t.songId}/${t.id}.m4a`,
      recordedAt: now,
      createdAt: now,
      syncedAt: now,
      kind: t.kind,
      tags: [...t.tags],
      ...('trimStartMs' in t ? { trimStartMs: t.trimStartMs } : {}),
      ...('trimEndMs' in t ? { trimEndMs: t.trimEndMs } : {}),
    })
  }

  await db.songLinks.put({ id: 'l1', songId: 's1', url: 'https://example.com/ref', label: 'ref', createdAt: now })
  await db.songComments.put({
    id: 'm1',
    songId: 's1',
    userId: 'u1',
    authorLabel: 'Sam',
    body: 'the bridge is the song',
    timestampMs: 41_000,
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
    deletedAt: null,
  })
}

/** Records without the given fields, sorted by id, so two snapshots compare. */
function without<T extends { id: string }>(rows: T[], fields: string[]) {
  return rows
    .map((row) => {
      const copy: Record<string, unknown> = { ...row }
      for (const field of fields) delete copy[field]
      return copy
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

const comparable = <T extends { id: string }>(rows: T[]) => without(rows, ['syncedAt'])

describe('backup round trip', () => {
  beforeEach(async () => {
    await wipeDevice()
    await seedBoard()
  })

  it('restores every song, take, link, comment and byte of audio', async () => {
    const before = {
      projects: await db.projects.toArray(),
      columns: await db.columns.toArray(),
      songs: comparable(await db.songs.toArray()),
      takes: without(await db.audioVersions.toArray(), ['syncedAt', 'localBlobId', 'uploadBlockedReason']),
      links: await db.songLinks.toArray(),
      comments: comparable(await db.songComments.toArray()),
      audio: Object.fromEntries(
        await Promise.all(
          (await db.audioVersions.toArray()).map(async (v) => [
            v.id,
            await sha((await db.audioBlobs.get(v.localBlobId!))!.blob),
          ]),
        ),
      ),
    }

    const { buildBoardBackup } = await import('@/lib/export/exportBoardBackup')
    const zip = await buildBoardBackup()

    await wipeDevice()
    expect(await db.songs.count()).toBe(0)
    expect(await db.audioBlobs.count()).toBe(0)

    const { importBoardBackup } = await import('@/lib/export/importBoardBackup')
    const result = await importBoardBackup(
      new File([zip], 'songdrafts-backup.zip', { type: 'application/zip' }),
      'replace',
    )

    expect(result).toMatchObject({ songsImported: 2, audioImported: 3, audioSkipped: 0 })

    const after = {
      projects: await db.projects.toArray(),
      columns: await db.columns.toArray(),
      songs: comparable(await db.songs.toArray()),
      takes: without(await db.audioVersions.toArray(), ['syncedAt', 'localBlobId', 'uploadBlockedReason']),
      links: await db.songLinks.toArray(),
      comments: comparable(await db.songComments.toArray()),
      audio: Object.fromEntries(
        await Promise.all(
          (await db.audioVersions.toArray()).map(async (v) => [
            v.id,
            await sha((await db.audioBlobs.get(v.localBlobId!))!.blob),
          ]),
        ),
      ),
    }

    expect(after.projects).toEqual(before.projects)
    expect(after.columns).toEqual(before.columns)
    expect(after.songs).toEqual(before.songs)
    expect(after.takes).toEqual(before.takes)
    expect(after.links).toEqual(before.links)
    expect(after.comments).toEqual(before.comments)
    expect(after.audio).toEqual(before.audio)

    // Each take's audio comes back as the type it went in as, AIFF included,
    // not relabelled as whatever the zip's file extension guessed.
    const restoredTypes = Object.fromEntries(
      (await db.audioVersions.toArray()).map((v) => [v.id, v.mimeType]),
    )
    expect(restoredTypes).toEqual({ v1: 'audio/mp4', v2: 'audio/wav', v3: 'audio/aiff' })
  })

  it('queues the restored takes to go back up to the cloud', async () => {
    const { buildBoardBackup } = await import('@/lib/export/exportBoardBackup')
    const zip = await buildBoardBackup()
    await wipeDevice()

    const { importBoardBackup } = await import('@/lib/export/importBoardBackup')
    await importBoardBackup(new File([zip], 'b.zip'), 'replace')

    const uploads = await db.syncQueue.filter((item) => item.op === 'upload').toArray()
    expect(uploads.map((u) => u.entityId).sort()).toEqual(['v1', 'v2', 'v3'])
  })
})
