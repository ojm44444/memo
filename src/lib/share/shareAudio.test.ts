import { describe, expect, it, vi } from 'vitest'
import {
  SHARE_URL_MARGIN_MS,
  SHARE_URL_TTL_MS,
  ShareAudioError,
  ShareUrlCache,
  type ShareAudioFetcher,
} from './shareAudio'

/**
 * Share pages get 10 minute URLs from the share-audio function (security
 * review, 19 Sept). These hold the refresh rules: reuse a URL only while it
 * has minutes left, ask again before it runs out, send the password, and
 * never start two requests for the same file at once.
 */

function setup() {
  let now = 1_000_000
  let n = 0
  const fetcher = vi.fn<ShareAudioFetcher>(async (request) => {
    n += 1
    const urls: Record<string, string> = {}
    for (const path of request.paths ?? []) urls[path] = `https://signed/${path}?v=${n}`
    return { urls, coverUrl: null, expiresIn: 600 }
  })
  const cache = new ShareUrlCache({ kind: 'collection', token: 'tok' }, fetcher, () => now)
  return {
    cache,
    fetcher,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('ShareUrlCache', () => {
  it('asks once, then reuses the URL while it is fresh', async () => {
    const { cache, fetcher, advance } = setup()
    const first = await cache.get('a.m4a')
    advance(SHARE_URL_TTL_MS - SHARE_URL_MARGIN_MS - 1)
    expect(await cache.get('a.m4a')).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asks again before the URL runs out', async () => {
    const { cache, fetcher, advance } = setup()
    const first = await cache.get('a.m4a')
    advance(SHARE_URL_TTL_MS - SHARE_URL_MARGIN_MS)
    expect(cache.peek('a.m4a')).toBeNull()
    const second = await cache.get('a.m4a')
    expect(second).not.toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('force asks again even when fresh (playback failed on it)', async () => {
    const { cache, fetcher } = setup()
    const first = await cache.get('a.m4a')
    const second = await cache.get('a.m4a', { force: true })
    expect(second).not.toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('shares one request between callers asking at the same time', async () => {
    const { cache, fetcher } = setup()
    const [a, b] = await Promise.all([cache.get('a.m4a'), cache.get('a.m4a')])
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends the token, kind, password and exactly one path', async () => {
    const { cache, fetcher } = setup()
    cache.setPassword('secret')
    await cache.get('a.m4a')
    expect(fetcher).toHaveBeenCalledWith({ kind: 'collection', token: 'tok', password: 'secret', paths: ['a.m4a'] })
  })

  it('judges an old URL expired even after it was replaced', async () => {
    const { cache, advance } = setup()
    const first = await cache.get('a.m4a')
    expect(cache.isExpired(first)).toBe(false)
    advance(SHARE_URL_TTL_MS - 30_000)
    expect(cache.isExpired(first)).toBe(false)
    expect(cache.isExpired(first, 60_000)).toBe(true)
    await cache.get('a.m4a')
    advance(30_000)
    expect(cache.isExpired(first)).toBe(true)
    expect(cache.isExpired('https://unknown')).toBe(true)
  })

  it('passes a refusal through (revoked link) and caches nothing', async () => {
    const fetcher = vi.fn<ShareAudioFetcher>(async () => {
      throw new ShareAudioError('Link not found or expired', 404)
    })
    const cache = new ShareUrlCache({ kind: 'song', token: 'gone' }, fetcher)
    await expect(cache.get('a.m4a')).rejects.toThrow(/not found/)
    expect(cache.peek('a.m4a')).toBeNull()
  })
})
