import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SILENT_SRC,
  __resetGlobalAudioForTests,
  isRealAudioSrc,
  markRealSrcSet,
  registerAudioEl,
  unlockAudioEl,
} from './globalAudioEl'

/**
 * The first-click-does-nothing bug (third report, 18 Sept 2026).
 *
 * The iOS unlock plays a silent clip on the real element and then puts it
 * away. It used to put it away with `src = ''`, which is a failed load: an
 * error event, and an element stuck in MEDIA_ERR_SRC_NOT_SUPPORTED, on which
 * the first play() rejects straight away and turns playback off. These tests
 * hold the two things that fixed it.
 */

function fakeAudio() {
  const el = document.createElement('audio')
  let paused = true
  Object.defineProperty(el, 'paused', { get: () => paused })
  el.play = vi.fn(() => {
    paused = false
    return Promise.resolve()
  })
  el.pause = vi.fn(() => {
    paused = true
  })
  el.load = vi.fn()
  return el
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('globalAudioEl unlock', () => {
  beforeEach(() => __resetGlobalAudioForTests())

  it('puts the silent clip away without an empty src', async () => {
    const el = fakeAudio()
    registerAudioEl(el)
    unlockAudioEl()
    expect(el.getAttribute('src')).toBe(SILENT_SRC)
    await flush()
    // No src attribute at all, never src="" (a failed load that errors).
    expect(el.hasAttribute('src')).toBe(false)
    expect(el.pause).toHaveBeenCalled()
  })

  it('leaves a real song alone when it took over during the unlock', async () => {
    const el = fakeAudio()
    registerAudioEl(el)
    unlockAudioEl()
    el.src = 'blob:real-song'
    markRealSrcSet()
    await flush()
    expect(el.getAttribute('src')).toBe('blob:real-song')
  })

  it('treats only a real song as a real source', () => {
    const el = fakeAudio()
    expect(isRealAudioSrc(el)).toBe(false)
    el.src = SILENT_SRC
    expect(isRealAudioSrc(el)).toBe(false)
    el.src = 'blob:real-song'
    expect(isRealAudioSrc(el)).toBe(true)
    expect(isRealAudioSrc(null)).toBe(false)
  })
})
