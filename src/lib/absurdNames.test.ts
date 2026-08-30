import { describe, expect, it } from 'vitest'
import { absurdNameFor, looksUnnamed } from './absurdNames'

describe('absurd names', () => {
  it('is stable for a given id, so a card never changes under you', () => {
    const a = absurdNameFor('song-123')
    const b = absurdNameFor('song-123')
    expect(a).toBe(b)
  })

  it('gives different ids different names', () => {
    const names = new Set(
      Array.from({ length: 40 }, (_, i) => absurdNameFor(`song-${i}`)),
    )
    // Not a uniqueness guarantee, just proof the seed actually varies.
    expect(names.size).toBeGreaterThan(20)
  })

  it('is always two words', () => {
    for (let i = 0; i < 30; i++) {
      expect(absurdNameFor(`s${i}`).split(' ')).toHaveLength(2)
    }
  })

  it('spots the filenames people actually end up with', () => {
    for (const t of ['New Recording 612', 'Untitled', 'voice memo 4', 'IMG_2085', '31:01:2025, 21:34', '']) {
      expect(looksUnnamed(t), t).toBe(true)
    }
  })

  it('never touches a name a person chose', () => {
    for (const t of ['car park chorus', 'the kettle song', 'Poem', '9 Wheelwrights Way 6']) {
      expect(looksUnnamed(t), t).toBe(false)
    }
  })
})
