import { describe, expect, it } from 'vitest'
import { canonicalAudioMime, classifyStorageRefusal, extensionForMime } from './cloudAudio'

const BUCKET_ALLOWS = new Set([
  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/wave', 'audio/vnd.wave', 'audio/aac', 'audio/aiff', 'audio/x-aiff', 'audio/x-caf',
  'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/opus', 'audio/webm', 'audio/amr', 'audio/3gpp',
  'video/quicktime', 'video/mp4',
])

describe('canonicalAudioMime', () => {
  // Every extension the importer accepts must map to a type the bucket
  // allows (migration 032). This is the mismatch that stranded takes.
  const imported = ['m4a', 'mp3', 'wav', 'aac', 'ogg', 'webm', 'mp4', 'caf', 'aiff', 'aif', 'qta', 'amr', 'flac', 'opus', 'mov']
  for (const ext of imported) {
    it(`.${ext} maps to a type the bucket accepts`, () => {
      expect(BUCKET_ALLOWS.has(canonicalAudioMime('', `x.${ext}`))).toBe(true)
    })
  }

  it('folds browser aliases for the same format onto one type', () => {
    expect(canonicalAudioMime('audio/x-wav', 'take.wav')).toBe('audio/wav')
    expect(canonicalAudioMime('audio/wave', 'take')).toBe('audio/wav')
    expect(canonicalAudioMime('audio/x-aiff', 'take')).toBe('audio/aiff')
  })

  it('keeps iPhone video as video, so the bucket takes it', () => {
    expect(canonicalAudioMime('video/quicktime', 'IMG_2085.MOV')).toBe('video/quicktime')
  })
})

describe('classifyStorageRefusal', () => {
  it('recognises the two permanent refusals', () => {
    expect(classifyStorageRefusal('The object exceeded the maximum allowed size')).toBe('too_large')
    expect(classifyStorageRefusal('mime type audio/x-caf is not supported')).toBe('unsupported_type')
  })
  it('does not treat a server fault as permanent', () => {
    expect(classifyStorageRefusal('permission denied for function account_within_storage_quota')).toBeNull()
  })
})

describe('extensionForMime', () => {
  it('gives a real extension for the storage path', () => {
    expect(extensionForMime('audio/aiff')).toBe('aiff')
    expect(extensionForMime('video/quicktime')).toBe('mov')
  })
})
