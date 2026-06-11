import { describe, expect, it } from 'vitest'
import { smartTitleFromFileName } from './smartTitle'

describe('smartTitleFromFileName', () => {
  it('strips recording prefix and extension', () => {
    expect(smartTitleFromFileName('Recording midnight train.m4a')).toBe('Midnight train')
  })

  it('returns Untitled memo for empty result', () => {
    expect(smartTitleFromFileName('Recording.m4a')).not.toBe('')
  })
})
