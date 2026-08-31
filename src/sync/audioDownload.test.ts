import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rule: A FILE THAT FAILS MUST NOT BE RE-DOWNLOADED ON THE NEXT TICK.
 *
 * The sync loop runs every eight seconds and asks for four uncached files. A
 * version stays uncached until its blob is written locally, so a failure at
 * the write step, which is where they happen, left the same four files
 * selected again immediately. The bytes arrived and were paid for every time
 * and nothing ever progressed. Gigabytes of egress, no uploads.
 */

const versions = new Map<string, { id: string; storagePath: string | null; localBlobId: string | null }>()
const download = vi.fn()
const putBlob = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    audioVersions: {
      get: async (id: string) => versions.get(id),
      update: async (id: string, patch: Record<string, unknown>) => {
        const v = versions.get(id)
        if (v) versions.set(id, { ...v, ...patch })
      },
      filter: (fn: (v: unknown) => boolean) => ({
        toArray: async () => [...versions.values()].filter(fn),
        count: async () => [...versions.values()].filter(fn).length,
      }),
    },
    audioBlobs: { put: async () => undefined },
    transaction: async (_mode: string, _a: unknown, _b: unknown, fn: () => Promise<void>) => {
      await putBlob()
      await fn()
    },
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  get supabase() {
    return { storage: { from: () => ({ download }) } }
  },
}))

vi.mock('@/lib/ids', () => ({ createId: () => 'blob-1' }))

describe('cachePendingRemoteAudio', () => {
  beforeEach(async () => {
    versions.clear()
    download.mockReset()
    putBlob.mockReset()
    versions.set('v1', { id: 'v1', storagePath: 'a/1.m4a', localBlobId: null })
    const mod = await import('./audioDownload')
    mod.resetAudioDownloadBackoff()
  })

  it('does not re-download a file that just failed', async () => {
    // The real failure: the bytes arrive, the local write throws (storage
    // quota, private window, full disk), the version stays uncached.
    download.mockResolvedValue({ data: new Blob(['x']), error: null })
    putBlob.mockRejectedValue(new Error('QuotaExceededError'))

    const { cachePendingRemoteAudio } = await import('./audioDownload')

    await cachePendingRemoteAudio({ limit: 4 })
    expect(download).toHaveBeenCalledTimes(1)

    // The next tick, eight seconds later. Before the backoff this downloaded
    // the same file again, and again, forever.
    await cachePendingRemoteAudio({ limit: 4 })
    await cachePendingRemoteAudio({ limit: 4 })
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('reports the held-back file as deferred, not as finished', async () => {
    download.mockResolvedValue({ data: new Blob(['x']), error: null })
    putBlob.mockRejectedValue(new Error('nope'))

    const { cachePendingRemoteAudio } = await import('./audioDownload')
    await cachePendingRemoteAudio({ limit: 4 })

    const second = await cachePendingRemoteAudio({ limit: 4 })
    expect(second.attempted).toBe(0)
    expect(second.deferred).toBe(1)
  })

  it('retries immediately when a person asks, via force', async () => {
    download.mockResolvedValue({ data: new Blob(['x']), error: null })
    putBlob.mockRejectedValue(new Error('nope'))

    const { cachePendingRemoteAudio } = await import('./audioDownload')
    await cachePendingRemoteAudio({ limit: 4 })
    await cachePendingRemoteAudio({ limit: 4, force: true })

    expect(download).toHaveBeenCalledTimes(2)
  })

  it('clears the backoff once a file finally succeeds', async () => {
    download.mockResolvedValue({ data: new Blob(['x']), error: null })
    putBlob.mockRejectedValueOnce(new Error('nope')).mockResolvedValue(undefined)

    const { cachePendingRemoteAudio, resetAudioDownloadBackoff } = await import('./audioDownload')
    await cachePendingRemoteAudio({ limit: 4 })
    resetAudioDownloadBackoff()
    await cachePendingRemoteAudio({ limit: 4 })

    expect(versions.get('v1')?.localBlobId).toBe('blob-1')

    // Cached now, so it is not selected again at any price.
    await cachePendingRemoteAudio({ limit: 4, force: true })
    expect(download).toHaveBeenCalledTimes(2)
  })
})
