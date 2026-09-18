import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

async function fresh() {
  vi.resetModules()
  localStorage.clear()
  return import('./attribution')
}

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

function fakeClient() {
  let cb: ((event: string, session: Session | null) => void) | null = null
  const updateUser = vi.fn().mockResolvedValue({ error: null })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const client = {
    auth: {
      onAuthStateChange: (fn: typeof cb) => {
        cb = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      updateUser,
    },
    rpc,
  }
  const signIn = async (user: Partial<User>) => {
    cb?.('SIGNED_IN', { user } as Session)
    await new Promise((r) => setTimeout(r, 5))
  }
  return { client, updateUser, rpc, signIn }
}

describe('first-touch attribution', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    setReferrer('')
  })

  it('keeps the first touch and never overwrites it', async () => {
    const m = await fresh()
    window.history.replaceState(null, '', '/?utm_source=reddit&utm_campaign=thread1&ref=abc')
    m.captureFirstTouch()
    window.history.replaceState(null, '', '/?utm_source=twitter')
    m.captureFirstTouch()
    const touch = JSON.parse(localStorage.getItem('sd_first_touch')!)
    expect(touch).toMatchObject({ utm_source: 'reddit', utm_campaign: 'thread1', ref: 'abc', path: '/' })
  })

  it('saves it once onto a new account', async () => {
    const m = await fresh()
    window.history.replaceState(null, '', '/?utm_source=reddit')
    m.captureFirstTouch()
    const { client, updateUser, signIn } = fakeClient()
    m.watchForNewAccount(client as never)
    const user = { id: 'u1', created_at: new Date().toISOString(), user_metadata: {} }
    await signIn(user)
    await signIn(user)
    expect(updateUser).toHaveBeenCalledTimes(1)
    expect(updateUser.mock.calls[0][0].data.first_touch.utm_source).toBe('reddit')
  })

  it('leaves old accounts and already-tagged accounts alone', async () => {
    const m = await fresh()
    window.history.replaceState(null, '', '/?utm_source=reddit')
    m.captureFirstTouch()
    const { client, updateUser, signIn } = fakeClient()
    m.watchForNewAccount(client as never)
    await signIn({ id: 'old', created_at: '2026-01-01T00:00:00Z', user_metadata: {} })
    await signIn({ id: 'tagged', created_at: new Date().toISOString(), user_metadata: { first_touch: { path: '/' } } })
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('referrer, promo and the signup source', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    setReferrer('')
  })

  it('keeps the whole referring address, and the host with it', async () => {
    const m = await fresh()
    setReferrer('https://www.reddit.com/r/Songwriting/comments/abc/def/?sort=new')
    m.captureFirstTouch()
    const touch = JSON.parse(localStorage.getItem('sd_first_touch')!)
    expect(touch.referrer_url).toBe('https://www.reddit.com/r/Songwriting/comments/abc/def/?sort=new')
    expect(touch.referrer).toBe('www.reddit.com')
  })

  it('ignores our own site as a referrer, and never overwrites the first touch', async () => {
    const m = await fresh()
    setReferrer('https://www.songdrafts.com/pricing')
    m.captureFirstTouch()
    expect(JSON.parse(localStorage.getItem('sd_first_touch')!).referrer_url).toBeUndefined()

    setReferrer('https://www.reddit.com/r/Songwriting/')
    m.captureFirstTouch()
    expect(JSON.parse(localStorage.getItem('sd_first_touch')!).referrer_url).toBeUndefined()
  })

  it('keeps a promo code, latest wins, letters and digits only', async () => {
    const m = await fresh()
    window.history.replaceState(null, '', '/?promo=unheard20')
    m.captureFirstTouch()
    expect(m.getPromo()).toBe('UNHEARD20')

    window.history.replaceState(null, '', '/?promo=spring%2050')
    m.capturePromo()
    expect(m.getPromo()).toBe('UNHEARD20')

    window.history.replaceState(null, '', '/?promo=spring50')
    m.capturePromo()
    expect(m.getPromo()).toBe('SPRING50')
  })

  it('keeps the answer to the question, and only a real answer', async () => {
    const m = await fresh()
    m.setHeardFrom({ source: 'other', other: '  a podcast  ' })
    expect(m.getHeardFrom()).toEqual({ source: 'other', other: 'a podcast' })

    m.setHeardFrom({ source: 'friend' })
    expect(m.getHeardFrom()).toEqual({ source: 'friend', other: undefined })

    m.setHeardFrom({ source: 'nowhere' as never })
    expect(m.getHeardFrom()).toBeNull()
  })

  it('writes the source once through the RPC, with the answer and the first touch', async () => {
    const m = await fresh()
    setReferrer('https://www.reddit.com/r/Songwriting/comments/abc/')
    window.history.replaceState(null, '', '/?utm_source=reddit&utm_medium=post&utm_campaign=thread1')
    m.captureFirstTouch()
    m.setHeardFrom({ source: 'reddit' })

    const { client, rpc, signIn } = fakeClient()
    m.watchForNewAccount(client as never)
    const user = { id: 'u1', created_at: new Date().toISOString(), user_metadata: {} }
    await signIn(user)
    await signIn(user)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('record_signup_source')
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_source: 'reddit',
      p_utm_source: 'reddit',
      p_utm_medium: 'post',
      p_utm_campaign: 'thread1',
      p_referrer: 'https://www.reddit.com/r/Songwriting/comments/abc/',
      p_landing_path: '/',
    })
  })

  it('tries again next time when the RPC fails, and leaves old accounts alone', async () => {
    const m = await fresh()
    m.setHeardFrom({ source: 'friend' })
    const { client, rpc, signIn } = fakeClient()
    rpc.mockResolvedValue({ error: { message: 'no' } })
    m.watchForNewAccount(client as never)
    const user = { id: 'u2', created_at: new Date().toISOString(), user_metadata: {} }
    await signIn(user)
    await signIn(user)
    expect(rpc).toHaveBeenCalledTimes(2)

    rpc.mockClear()
    await signIn({ id: 'old', created_at: '2026-01-01T00:00:00Z', user_metadata: {} })
    expect(rpc).not.toHaveBeenCalled()
  })
})
