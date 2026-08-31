import { describe, expect, it } from 'vitest'
import { looksUnnamed, repeatedStems, looksUnnamedInLibrary } from './unnamedTitles'

describe('unnamed titles', () => {
  it('spots the filenames people actually end up with', () => {
    for (const t of ['New Recording 612', 'Untitled', 'voice memo 4', 'IMG_2085', '31:01:2025, 21:34', '']) {
      expect(looksUnnamed(t), t).toBe(true)
    }
  })

  it('never touches a name a person chose', () => {
    for (const t of ['car park chorus', 'the kettle song', 'Poem', '14 Kiln Lane 6']) {
      expect(looksUnnamed(t), t).toBe(false)
    }
  })
})

describe('repeatedStems, on a realistic imported library', () => {
  const REAL = [
    'Northgate Rehearsal Rooms 2', 'Northgate Rehearsal Rooms 3',
    'Northgate Rehearsal Rooms 4', 'Northgate Rehearsal Rooms 5',
    'Northgate Rehearsal Rooms 13', 'Northgate Rehearsal Rooms 14',
    'Pinefield Business Park 16', 'Pinefield Business Park 17',
    'Pinefield Business Park 18',
    '14 Kiln Lane 6', '14 Kiln Lane 7', '14 Kiln Lane 10',
    'The Anchor Inn', 'Riverside Leisure Centre',
    'A617', 'A617 2',
    '? - am I enough?', '? - maybe I’ve fucked it',
    'too good to sit on a hard drive',
    'Toilet noise sample', 'Whistle to sample',
    'New Recording 10',
  ]
  const stems = repeatedStems(REAL)

  it('flags location auto-names that repeat', () => {
    expect(looksUnnamedInLibrary('Northgate Rehearsal Rooms 14', stems)).toBe(true)
    expect(looksUnnamedInLibrary('Pinefield Business Park 18', stems)).toBe(true)
    expect(looksUnnamedInLibrary('14 Kiln Lane 7', stems)).toBe(true)
  })

  it('leaves a one-off location alone: it may well be the title', () => {
    expect(looksUnnamedInLibrary('The Anchor Inn', stems)).toBe(false)
    expect(looksUnnamedInLibrary('Riverside Leisure Centre', stems)).toBe(false)
  })

  it('two of a stem is a coincidence, not a rehearsal room', () => {
    expect(looksUnnamedInLibrary('A617 2', stems)).toBe(false)
  })

  it('never touches a name he chose, including his "? -" convention', () => {
    expect(looksUnnamedInLibrary('? - am I enough?', stems)).toBe(false)
    expect(looksUnnamedInLibrary('too good to sit on a hard drive', stems)).toBe(false)
    expect(looksUnnamedInLibrary('Whistle to sample', stems)).toBe(false)
  })

  it('still catches the plain filenames without any library context', () => {
    expect(looksUnnamedInLibrary('New Recording 10')).toBe(true)
  })
})
