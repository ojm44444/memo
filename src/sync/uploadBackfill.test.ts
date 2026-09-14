import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics', () => ({ recordEvent: vi.fn(() => Promise.resolve()) }))

const { db } = await import('@/db/database')
const { requeueStrandedUploads, requeueStrandedUploadsOnce, resetUploadBackfillForTests } =
  await import('@/sync/uploadBackfill')
const { CLOUD_MAX_BYTES } = await import('@/lib/cloudAudio')
const { recordEvent } = await import('@/lib/analytics')

/**
 * The recovery for takes that never reached the cloud.
 *
 * From 26 Aug every upload was refused, and the bucket had always refused
 * several formats. Each failed job was retried five times and then deleted, so
 * fixing the causes brought nothing back. These tests hold the recovery to
 * queueing exactly the takes that need it, and nothing else.
 */

const now = new Date().toISOString()

async function song(id: string, deleted = false) {
  await db.songs.put({
    id, title: id, columnSlug: 'inbox', projectId: null, tags: [], isFavourite: false,
    musicalKey: null, bpm: null, sortOrder: 0, notes: '', recordedAt: null,
    createdAt: now, updatedAt: now, syncedAt: null, deletedAt: deleted ? now : null,
  })
}

async function take(id: string, songId: string, opts: { storagePath?: string | null; blob?: 'present' | 'missing'; size?: number; blocked?: 'too_large' | null; mime?: string } = {}) {
  const blobId = `blob-${id}`
  await db.audioVersions.put({
    id, songId, label: id, durationMs: 1000, mimeType: opts.mime ?? 'audio/mp4', sortOrder: 0,
    localBlobId: blobId, storagePath: opts.storagePath ?? null, recordedAt: null, createdAt: now,
    syncedAt: null, uploadBlockedReason: opts.blocked ?? null,
  })
  if (opts.blob !== 'missing') {
    await db.audioBlobs.put({ id: blobId, blob: new Blob([new Uint8Array(16)]), mimeType: opts.mime ?? 'audio/mp4', size: opts.size ?? 16, createdAt: now })
  }
}

const queuedUploads = async () =>
  (await db.syncQueue.toArray()).filter((q) => q.entityType === 'audio_version' && q.op === 'upload')

describe('requeueStrandedUploads', () => {
  beforeEach(async () => {
    await Promise.all([db.songs.clear(), db.audioVersions.clear(), db.audioBlobs.clear(), db.syncQueue.clear()])
    vi.mocked(recordEvent).mockClear()
    resetUploadBackfillForTests()
    await song('s1')
  })

  it('queues a take that has audio here and no cloud copy', async () => {
    await take('stranded', 's1', { size: 2048, mime: 'audio/aiff' })
    const r = await requeueStrandedUploads()
    expect(r).toMatchObject({ queued: 1, bytes: 2048 })
    const [job] = await queuedUploads()
    expect(job.entityId).toBe('stranded')
    expect(JSON.parse(job.payload).fileName).toBe('stranded.aiff')
  })

  it('leaves takes that are already in the cloud alone', async () => {
    await take('in-cloud', 's1', { storagePath: 'u/b/s1/in-cloud.m4a' })
    expect((await requeueStrandedUploads()).queued).toBe(0)
    expect(await queuedUploads()).toHaveLength(0)
  })

  it('does not queue a take twice', async () => {
    await take('stranded', 's1')
    await requeueStrandedUploads()
    await requeueStrandedUploads()
    expect(await queuedUploads()).toHaveLength(1)
  })

  it('skips takes on deleted songs', async () => {
    await song('gone', true)
    await take('orphan', 'gone')
    expect((await requeueStrandedUploads()).queued).toBe(0)
  })

  it('records a take over the cloud limit as blocked instead of queueing it', async () => {
    await take('huge', 's1', { size: CLOUD_MAX_BYTES + 1 })
    const r = await requeueStrandedUploads()
    expect(r).toMatchObject({ queued: 0, tooLarge: 1 })
    expect((await db.audioVersions.get('huge'))?.uploadBlockedReason).toBe('too_large')
  })

  it('does not retry a take the cloud has already refused', async () => {
    await take('refused', 's1', { blocked: 'too_large' })
    expect((await requeueStrandedUploads()).queued).toBe(0)
  })

  it('counts a take whose audio is missing from this device, without queueing it', async () => {
    await take('no-audio', 's1', { blob: 'missing' })
    const r = await requeueStrandedUploads()
    expect(r).toMatchObject({ queued: 0, missingBlob: 1 })
  })

  it('reports the count, so the recovery is a number on the server', async () => {
    await take('a', 's1')
    await take('b', 's1')
    await requeueStrandedUploads()
    expect(recordEvent).toHaveBeenCalledWith('upload_backfill', 2, 'queued')
  })

  it('runs once per page load', async () => {
    await take('a', 's1')
    expect(await requeueStrandedUploadsOnce()).not.toBeNull()
    expect(await requeueStrandedUploadsOnce()).toBeNull()
  })
})
