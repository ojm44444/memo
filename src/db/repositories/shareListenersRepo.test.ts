import { describe, expect, it } from 'vitest'
import { getListenerId, groupListeners, type ShareListenEventRow } from './shareListenersRepo'

describe('getListenerId', () => {
  it('is stable for this browser', () => {
    const first = getListenerId()
    expect(first).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(getListenerId()).toBe(first)
  })
})

describe('groupListeners', () => {
  const row = (over: Partial<ShareListenEventRow>): ShareListenEventRow => ({
    listener_id: 'aaaaaaaa',
    event: 'open',
    listener_name: null,
    created_at: '2026-09-18T10:00:00Z',
    ...over,
  })

  it('makes one entry per listener, newest first, with a name from any row', () => {
    const out = groupListeners([
      row({ listener_id: 'aaaaaaaa', event: 'open', created_at: '2026-09-18T10:00:00Z' }),
      row({ listener_id: 'aaaaaaaa', event: 'play', listener_name: 'Dan', created_at: '2026-09-18T10:01:00Z' }),
      row({ listener_id: 'bbbbbbbb', created_at: '2026-09-18T11:00:00Z' }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'bbbbbbbb', name: null, played: false })
    expect(out[1]).toMatchObject({ id: 'aaaaaaaa', name: 'Dan', played: true, lastAt: '2026-09-18T10:01:00Z' })
  })
})
