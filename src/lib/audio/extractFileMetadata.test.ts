import { describe, expect, it } from 'vitest'
import { normalizeBpm, normalizeMusicalKey } from './extractFileMetadata'

describe('normalizeMusicalKey', () => {
  it('returns null for empty values', () => {
    expect(normalizeMusicalKey(null)).toBeNull()
    expect(normalizeMusicalKey('   ')).toBeNull()
  })

  it('preserves trimmed key text', () => {
    expect(normalizeMusicalKey('  Am  ')).toBe('Am')
  })
})

describe('normalizeBpm', () => {
  it('rounds and bounds bpm', () => {
    expect(normalizeBpm(91.6)).toBe(92)
    expect(normalizeBpm(0)).toBeNull()
    expect(normalizeBpm(999)).toBeNull()
  })
})
