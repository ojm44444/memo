import { describe, expect, it } from 'vitest'
import {
  classifyDropFailure,
  extractAudioFiles,
  getFilesFromDataTransferSync,
  isFileDragEvent,
  isVoiceMemosAppDrop,
} from './extract-audio-files'

describe('extractAudioFiles', () => {
  it('accepts audio mime types', () => {
    const files = [new File([''], 'memo.m4a', { type: 'audio/mp4' })]
    expect(extractAudioFiles(files)).toHaveLength(1)
  })

  it('accepts common extensions when mime is empty', () => {
    const files = [new File([''], 'Voice Memo 147.m4a', { type: '' })]
    expect(extractAudioFiles(files)).toHaveLength(1)
  })

  it('accepts opaque binary folder drops', () => {
    const data = new Uint8Array(800).fill(1)
    const files = [new File([data], '2024-01-01 120000.m4a', { type: 'application/octet-stream' })]
    expect(extractAudioFiles(files)).toHaveLength(1)
  })

  it('rejects non-audio files', () => {
    const files = [new File([''], 'notes.txt', { type: 'text/plain' })]
    expect(extractAudioFiles(files)).toHaveLength(0)
  })
})

describe('isFileDragEvent', () => {
  it('accepts Files type', () => {
    const event = { dataTransfer: { types: ['Files'], items: [] } } as unknown as DragEvent
    expect(isFileDragEvent(event)).toBe(true)
  })

  it('accepts file items during drag', () => {
    const event = {
      dataTransfer: {
        types: ['text/uri-list'],
        items: [{ kind: 'file' }],
      },
    } as unknown as DragEvent
    expect(isFileDragEvent(event)).toBe(true)
  })
})

describe('getFilesFromDataTransferSync', () => {
  it('reads files from items API synchronously', () => {
    const file = new File(['audio'], 'Recording.m4a', { type: 'audio/mp4' })
    const dt = {
      files: [] as unknown as FileList,
      items: [
        {
          kind: 'file',
          getAsFile: () => file,
          webkitGetAsEntry: undefined,
        },
      ],
    } as unknown as DataTransfer

    const result = getFilesFromDataTransferSync(dt)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Recording.m4a')
  })
})

describe('isVoiceMemosAppDrop', () => {
  it('detects string-only drops typical of Voice Memos app', () => {
    const dt = {
      files: [] as unknown as FileList,
      items: [{ kind: 'string', type: 'text/uri-list' }],
      types: ['text/uri-list'],
    } as unknown as DataTransfer
    expect(isVoiceMemosAppDrop(dt)).toBe(true)
  })
})

describe('classifyDropFailure', () => {
  it('detects icloud stubs', () => {
    expect(classifyDropFailure([new File([], 'memo.m4a.icloud', { type: '' })])).toBe('icloud')
  })
})
