import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rule this file exists to protect:
 *
 *   FAILING TO CONFIRM A SESSION IS NOT THE SAME AS BEING SIGNED OUT.
 *
 * When it was, AuthGate read the null and wiped IndexedDB, taking the audio
 * blobs and the not-yet-uploaded sync queue with it. Every way of failing to
 * reach Supabase while still technically online, a refused token refresh, a
 * quota block, a captive portal, a slow response, arrived here as a null and
 * left as data loss.
 */

const syncMeta = new Map<string, string>()

vi.mock('@/db/database', () => ({
  db: {
    syncMeta: {
      get: async (key: string) => {
        const value = syncMeta.get(key)
        return value === undefined ? undefined : { key, value }
      },
    },
  },
}))

const getSession = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  get supabase() {
    return { auth: { getSession } }
  },
  supabaseConfigured: true,
}))

vi.mock('@/lib/auth/devBypass', () => ({
  isDevAuthBypass: () => false,
  DEV_BYPASS_USER: { id: 'dev', email: 'dev@example.com' },
}))

const online = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })

describe('resolveBoardAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    syncMeta.clear()
    getSession.mockReset()
    online(true)
  })

  it('keeps the board when the session check fails but the device holds one', async () => {
    // The quota block, the captive portal, the refused refresh. Online, and
    // Supabase will not answer.
    syncMeta.set('lastUserId', 'user-1')
    syncMeta.set('lastUserEmail', 'owen@example.com')
    getSession.mockResolvedValue({ data: { session: null } })

    const { resolveBoardAuth } = await import('./session')
    const auth = await resolveBoardAuth()

    expect(auth).not.toBeNull()
    expect(auth?.user.id).toBe('user-1')
    expect(auth?.offlineGrace).toBe(true)
  })

  it('keeps the board when getSession never resolves at all', async () => {
    syncMeta.set('lastUserId', 'user-1')
    getSession.mockReturnValue(new Promise(() => {}))

    const { resolveBoardAuth } = await import('./session')
    const auth = await resolveBoardAuth()

    expect(auth?.user.id).toBe('user-1')
  }, 10_000)

  it('still reports signed out on a device that never had a board', async () => {
    // No lastUserId means nothing of anyone's is here to protect, so a
    // stranger is correctly sent to sign in.
    getSession.mockResolvedValue({ data: { session: null } })

    const { resolveBoardAuth } = await import('./session')
    expect(await resolveBoardAuth()).toBeNull()
  })

  it('reports signed out after a real sign-out, which clears lastUserId', async () => {
    // clearLocalUserBoard wipes syncMeta, so the deliberate exit cannot be
    // undone by the grace path above.
    getSession.mockResolvedValue({ data: { session: null } })

    const { resolveBoardAuth } = await import('./session')
    expect(await resolveBoardAuth()).toBeNull()
  })

  it('prefers a live session over the cached identity', async () => {
    syncMeta.set('lastUserId', 'stale-user')
    getSession.mockResolvedValue({ data: { session: { user: { id: 'live-user' } } } })

    const { resolveBoardAuth } = await import('./session')
    const auth = await resolveBoardAuth()

    expect(auth?.user.id).toBe('live-user')
    expect(auth?.offlineGrace).toBe(false)
  })

  it('falls back to the cached identity when offline', async () => {
    online(false)
    syncMeta.set('lastUserId', 'user-1')

    const { resolveBoardAuth } = await import('./session')
    const auth = await resolveBoardAuth()

    expect(auth?.user.id).toBe('user-1')
    expect(auth?.offlineGrace).toBe(true)
  })
})
