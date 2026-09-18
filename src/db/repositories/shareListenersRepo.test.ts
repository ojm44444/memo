import { describe, expect, it } from 'vitest'
import { getListenerId, groupListeners, placeFromTimeZone, type ShareListenEventRow } from './shareListenersRepo'

describe('placeFromTimeZone', () => {
  it('reads a rough place from the zone', () => {
    expect(placeFromTimeZone('Europe/London')).toBe('London')
    expect(placeFromTimeZone('America/Los_Angeles')).toBe('Los Angeles')
    expect(placeFromTimeZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
  })

  it('gives nothing for zones that name no place, or junk', () => {
    expect(placeFromTimeZone('UTC')).toBeNull()
    expect(placeFromTimeZone('Etc/GMT+5')).toBeNull()
    expect(placeFromTimeZone('x/<script>')).toBeNull()
    expect(placeFromTimeZone(null)).toBeNull()
  })
})

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
    time_zone: 'Europe/London',
    place: 'London',
    created_at: '2026-09-18T10:00:00Z',
    ...over,
  })

  it('makes one entry per listener, newest first, with a name from any row', () => {
    const out = groupListeners([
      row({ listener_id: 'aaaaaaaa', event: 'open', created_at: '2026-09-18T10:00:00Z' }),
      row({ listener_id: 'aaaaaaaa', event: 'play', listener_name: 'Dan', created_at: '2026-09-18T10:01:00Z' }),
      row({
        listener_id: 'bbbbbbbb',
        time_zone: 'America/Los_Angeles',
        place: null,
        created_at: '2026-09-18T11:00:00Z',
      }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'bbbbbbbb', name: null, place: 'Los Angeles', played: false })
    expect(out[1]).toMatchObject({ id: 'aaaaaaaa', name: 'Dan', place: 'London', played: true, lastAt: '2026-09-18T10:01:00Z' })
  })
})
