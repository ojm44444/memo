import { describe, expect, it } from 'vitest'
import { smartTitleFromFileName } from './smartTitle'

describe('smartTitleFromFileName', () => {
  it('keeps the filename as the recorder actually wrote it', () => {
    // The old version stripped "Recording" off the front, which turned this
    // into the bare number "11" and made a labelled file look unnamed.
    expect(smartTitleFromFileName('Recording 11.m4a')).toBe('Recording 11')
    expect(smartTitleFromFileName('Voice Memo 3.m4a')).toBe('Voice Memo 3')
  })

  it('drops only the extension and tidies underscores standing in for spaces', () => {
    expect(smartTitleFromFileName('midnight_train_idea.wav')).toBe('Midnight train idea')
  })

  it('falls back to Untitled memo only when nothing is left at all', () => {
    expect(smartTitleFromFileName('.m4a')).toBe('Untitled memo')
  })

  it('does not invent an Untitled fallback for a real name', () => {
    expect(smartTitleFromFileName('Recording.m4a')).toBe('Recording')
  })
})
