import { AUDIO_MIME_ALLOWLIST } from '@/lib/constants'
import type { ColumnSlug } from '@/types/column'

const AUDIO_EXTENSIONS = new Set([
  '.m4a',
  '.mp3',
  '.wav',
  '.aac',
  '.ogg',
  '.webm',
  '.mp4',
  '.caf',
  '.aiff',
  '.aif',
  '.qta',
  '.amr',
])

function nameLooksLikeVoiceMemo(name: string) {
  return /recording|voice\s*memo|memo\s*\d|audio\s*recording|\d{4}-\d{2}-\d{2}|obermättliweg/i.test(
    name,
  )
}

function hasAudioExtension(name: string) {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ext ? AUDIO_EXTENSIONS.has(ext) : false
}

function matchesAudioStrict(file: File) {
  if (file.type.startsWith('audio/')) return true
  if (AUDIO_MIME_ALLOWLIST.includes(file.type)) return true
  if (file.type === 'video/mp4' || file.type === 'video/quicktime') return true
  if (hasAudioExtension(file.name)) return true
  if ((file.type === '' || file.type === 'application/octet-stream') && nameLooksLikeVoiceMemo(file.name)) {
    return true
  }
  return false
}

function isICloudStub(file: File) {
  return file.size < 200 || file.name.endsWith('.icloud')
}

function isLikelyDroppedMedia(file: File) {
  if (isICloudStub(file)) return false
  if (file.type.startsWith('text/') || file.type.startsWith('image/')) return false
  if (file.type === 'application/pdf' || file.type === 'application/json') return false
  if (matchesAudioStrict(file)) return true
  return file.size > 400
}

/**
 * On the board page, accept almost any external drag so Voice Memos / Finder
 * both trigger the overlay. We validate real files on drop.
 */
export function isFileDragEvent(event: DragEvent | React.DragEvent) {
  const dt = event.dataTransfer
  if (!dt) return false

  const types = Array.from(dt.types ?? [])

  if (types.length === 1 && types[0] === 'text/html') return false

  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' || item.kind === 'string') return true
    }
  }

  if (types.length === 0) return true

  return true
}

function dedupeFiles(files: File[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractAudioFiles(files: FileList | File[]): File[] {
  const list = Array.from(files)
  const strict = list.filter(matchesAudioStrict)
  if (strict.length > 0) return dedupeFiles(strict)

  const media = list.filter(isLikelyDroppedMedia)
  if (media.length > 0) return dedupeFiles(media)

  return []
}

export type DropRejectReason = 'empty' | 'icloud' | 'voice-memos-app' | 'unsupported'

export function isVoiceMemosAppDrop(dt: DataTransfer) {
  let hasStringItem = false
  let hasFileItem = false

  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') hasFileItem = true
      if (item.kind === 'string') hasStringItem = true
    }
  }

  const types = Array.from(dt.types ?? [])
  const hasAppleType = types.some(
    (t) =>
      t.startsWith('com.apple.') ||
      t.startsWith('dyn.') ||
      t.includes('voice') ||
      t.includes('VoiceMemos'),
  )

  return (hasStringItem && !hasFileItem) || (hasAppleType && dt.files.length === 0)
}

export function classifyDropFailure(rawFiles: File[], dt?: DataTransfer): DropRejectReason {
  if (rawFiles.length === 0) {
    if (dt && isVoiceMemosAppDrop(dt)) return 'voice-memos-app'
    // Chrome often clears dataTransfer after drop; empty + no files usually means app drag.
    if (!dt || dt.files.length === 0) return 'voice-memos-app'
    return 'empty'
  }
  if (rawFiles.every(isICloudStub) || rawFiles.some((f) => f.name.endsWith('.icloud'))) {
    return 'icloud'
  }
  return 'unsupported'
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file((file) => resolve(file), () => resolve(null))
  })
}

/**
 * MUST run synchronously inside the drop event — async breaks Voice Memos / macOS app drags.
 */
export function getFilesFromDataTransferSync(dt: DataTransfer): File[] {
  const collected: File[] = []

  if (dt.files?.length) {
    collected.push(...Array.from(dt.files))
  }

  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) collected.push(file)
    }
  }

  return dedupeFiles(collected)
}

/** Async fallback for Finder folder entry drags only. */
export async function getFilesFromDataTransferAsync(dt: DataTransfer): Promise<File[]> {
  const sync = getFilesFromDataTransferSync(dt)
  if (sync.length > 0) return sync

  const collected: File[] = []

  if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isFile) {
        const file = await readFileEntry(entry as FileSystemFileEntry)
        if (file) collected.push(file)
      }
    }
  }

  return dedupeFiles(collected)
}

/** @deprecated Use sync + async helpers directly in the drop handler. */
export async function getFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  return getFilesFromDataTransferAsync(dt)
}

export function columnSlugFromDropPoint(clientX: number, clientY: number): ColumnSlug | null {
  const el = document.elementFromPoint(clientX, clientY)
  const column = el?.closest<HTMLElement>('[data-column-slug]')
  const slug = column?.dataset.columnSlug
  return slug ?? null
}
