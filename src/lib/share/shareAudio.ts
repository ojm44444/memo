/**
 * Audio URLs for the share pages, from the share-audio edge function.
 *
 * Listeners without an account cannot sign storage URLs themselves any more
 * (security review, 19 Sept): the function checks the link (live, password,
 * the file is on it) and signs for 10 minutes. So a revoked link stops
 * working within minutes even for someone mid-listen, and nobody can mint a
 * URL that outlives the link.
 *
 * Ten minutes is shorter than a long listening session, so URLs are cached
 * with their age and asked for again before they run out: when a track
 * starts, when the next one is preloaded, and when playback fails on one that
 * has expired.
 */

export type ShareKind = 'song' | 'collection'

export interface ShareAudioRequest {
  kind: ShareKind
  token: string
  password?: string
  paths?: string[]
  cover?: boolean
  download?: string
}

export interface ShareAudioResponse {
  urls: Record<string, string>
  coverUrl: string | null
  expiresIn: number
}

/** Matches the function's own cap. */
export const MAX_PATHS_PER_REQUEST = 4
/** How long a URL works (the function signs for 600 s). */
export const SHARE_URL_TTL_MS = 10 * 60 * 1000
/** Ask again this long before it runs out, so a track never starts on a dying URL. */
export const SHARE_URL_MARGIN_MS = 3 * 60 * 1000

export class ShareAudioError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type ShareAudioFetcher = (request: ShareAudioRequest) => Promise<ShareAudioResponse>

export const fetchShareAudio: ShareAudioFetcher = async (request) => {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) throw new ShareAudioError('Share links are not configured', 503)
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const response = await fetch(`${base}/functions/v1/share-audio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({
      kind: request.kind,
      token: request.token,
      password: request.password?.trim() || undefined,
      paths: request.paths,
      cover: request.cover || undefined,
      download: request.download,
    }),
  })
  const body = (await response.json().catch(() => null)) as (Partial<ShareAudioResponse> & { error?: string }) | null
  if (!response.ok || !body || body.error) {
    throw new ShareAudioError(body?.error ?? 'Could not open that file', response.status)
  }
  return { urls: body.urls ?? {}, coverUrl: body.coverUrl ?? null, expiresIn: body.expiresIn ?? 600 }
}

/**
 * Signed URLs for one share link, by storage path, each with the time it was
 * signed. `get` hands back a cached URL only while it has comfortably longer
 * to live than SHARE_URL_MARGIN_MS; otherwise it asks the function again.
 */
export class ShareUrlCache {
  private entries = new Map<string, { url: string; at: number }>()
  /** Every URL handed out, by when it was signed, so an old one can be judged after a refresh. */
  private signedAt = new Map<string, number>()
  private inflight = new Map<string, Promise<string>>()

  private password: string | undefined
  private readonly link: { kind: ShareKind; token: string }
  private readonly fetcher: ShareAudioFetcher
  private readonly now: () => number

  constructor(
    link: { kind: ShareKind; token: string },
    fetcher: ShareAudioFetcher = fetchShareAudio,
    now: () => number = Date.now,
  ) {
    this.link = link
    this.fetcher = fetcher
    this.now = now
  }

  /** The password the link opened with; sent with every request after. */
  setPassword(password: string | undefined) {
    this.password = password
  }

  /** A cached URL that is still fresh, or null. Never starts a request. */
  peek(path: string): string | null {
    const entry = this.entries.get(path)
    if (!entry) return null
    if (this.now() - entry.at >= SHARE_URL_TTL_MS - SHARE_URL_MARGIN_MS) return null
    return entry.url
  }

  /**
   * True once a URL is at or near the end of its signed lifetime, so a new
   * request on it (a seek, more buffering) would be refused. `slackMs` treats
   * it as gone that much early, for clock drift. Unknown URLs count as expired.
   */
  isExpired(url: string, slackMs = 0): boolean {
    const at = this.signedAt.get(url)
    if (at === undefined) return true
    return this.now() - at >= SHARE_URL_TTL_MS - slackMs
  }

  clear() {
    this.entries.clear()
    this.signedAt.clear()
  }

  async get(path: string, options: { force?: boolean } = {}): Promise<string> {
    if (!options.force) {
      const fresh = this.peek(path)
      if (fresh) return fresh
    }
    const pending = this.inflight.get(path)
    if (pending) return pending
    const request = (async () => {
      const at = this.now()
      const { urls } = await this.fetcher({ ...this.link, password: this.password, paths: [path] })
      const url = urls[path]
      if (!url) throw new ShareAudioError('Could not open that file', 502)
      this.entries.set(path, { url, at })
      for (const [old, oldAt] of this.signedAt) {
        if (at - oldAt > 2 * SHARE_URL_TTL_MS) this.signedAt.delete(old)
      }
      this.signedAt.set(url, at)
      return url
    })()
    this.inflight.set(path, request)
    try {
      return await request
    } finally {
      this.inflight.delete(path)
    }
  }
}
