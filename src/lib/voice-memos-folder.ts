import { extractAudioFiles } from '@/lib/extract-audio-files'

export const VOICE_MEMOS_FOLDER_HINT =
  '~/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings'

export interface ScannedMemo {
  file: File
  sourceKey: string
}

export function supportsVoiceMemosFolderLink() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export function makeSourceKey(relativePath: string, file: File) {
  return `${relativePath}:${file.size}:${file.lastModified}`
}

export function isICloudStub(file: File) {
  return file.size < 200 || file.name.endsWith('.icloud')
}

async function verifyReadPermission(handle: FileSystemDirectoryHandle) {
  const options = { mode: 'read' as const }
  if ((await handle.queryPermission(options)) === 'granted') return true
  if ((await handle.requestPermission(options)) === 'granted') return true
  return false
}

export async function pickVoiceMemosFolder() {
  if (!window.showDirectoryPicker) throw new Error('unsupported')
  const handle = await window.showDirectoryPicker({
    id: 'memo-voice-memos',
    mode: 'read',
    startIn: 'documents',
  })
  const allowed = await verifyReadPermission(handle)
  if (!allowed) throw new Error('permission-denied')
  return handle
}

export async function collectAudioFilesFromDirectory(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<ScannedMemo[]> {
  const collected: ScannedMemo[] = []

  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name

    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile()
      const [audio] = extractAudioFiles([file])
      if (audio) {
        collected.push({ file: audio, sourceKey: makeSourceKey(path, audio) })
      }
      continue
    }

    if (handle.kind === 'directory') {
      const nested = await collectAudioFilesFromDirectory(handle as FileSystemDirectoryHandle, path)
      collected.push(...nested)
    }
  }

  return collected
}

export async function scanVoiceMemosFolder(handle: FileSystemDirectoryHandle) {
  const allowed = await verifyReadPermission(handle)
  if (!allowed) throw new Error('permission-denied')

  const files = await collectAudioFilesFromDirectory(handle)
  const stubs = files.filter(({ file }) => isICloudStub(file))
  const ready = files.filter(({ file }) => !isICloudStub(file))

  return { files: ready, stubCount: stubs.length }
}
