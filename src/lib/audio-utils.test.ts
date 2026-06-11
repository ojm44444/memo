import { describe, expect, it } from 'vitest'
import { formatDuration } from './audio-utils'

describe('formatDuration', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatDuration(154000)).toBe('2:34')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(null)).toBe('0:00')
  })
})
