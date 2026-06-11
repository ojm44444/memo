import { describe, expect, it } from 'vitest'
import { makeSourceKey } from './voice-memos-folder'

describe('makeSourceKey', () => {
  it('combines path, size, and lastModified', () => {
    const file = new File(['abc'], 'idea.m4a', { type: 'audio/mp4', lastModified: 123 })
    Object.defineProperty(file, 'size', { value: 456 })
    expect(makeSourceKey('idea.m4a', file)).toBe('idea.m4a:456:123')
  })
})
