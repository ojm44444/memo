import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

async function fresh() {
  vi.resetModules()
  localStorage.clear()
  return import('./attribution')
}

function fakeClient() {
  let cb: ((event: string, session: Session | null) => void) | null = null
  const updateUser = vi.fn().mockResolvedValue({ error: null })
  const client = {
    auth: {
      onAuthStateChange: (fn: typeof cb) => {
        cb = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      updateUser,
    },
  }
  const signIn = async (user: Partial<User>) => {
    cb?.('SIGNED_IN', { user } as Session)
    await new Promise((r) => setTimeout(r, 5))
  }
  return { client, updateUser, signIn }
}

describe('first-touch attribution', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
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
