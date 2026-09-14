/**
 * What the cloud will store, in one place, so the client and the bucket agree.
 *
 * The audio bucket used to accept eight MIME types up to 50 MB while the app
 * imported many more, and an upload the bucket refused was retried five times
 * and then silently dropped. Migration 032 widened the bucket; this file is
 * the client's copy of the same rules. Keep the two in step.
 */

/** Must match storage.buckets.file_size_limit for 'audio' (migration 032). */
export const CLOUD_MAX_BYTES = 200 * 1024 * 1024

/**
 * One canonical type per format, chosen from the extension when it is known.
 *
 * The browser's own type came first before, and browsers disagree: the same
 * WAV arrives as audio/wav, audio/x-wav or audio/wave depending on the
 * browser and the file's origin. The extension is the steadier signal.
 */
export function canonicalAudioMime(mime: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'm4a':
      return 'audio/mp4'
    case 'mp4':
    case 'm4v':
      return mime.startsWith('video/') ? 'video/mp4' : 'audio/mp4'
    case 'mov':
    case 'qta':
      return 'video/quicktime'
    case 'wav':
      return 'audio/wav'
    case 'mp3':
      return 'audio/mpeg'
    case 'aac':
      return 'audio/aac'
    case 'caf':
      return 'audio/x-caf'
    case 'aif':
    case 'aiff':
      return 'audio/aiff'
    case 'flac':
      return 'audio/flac'
    case 'ogg':
    case 'opus':
      return 'audio/ogg'
    case 'webm':
      return 'audio/webm'
    case 'amr':
      return 'audio/amr'
  }
  if (mime && mime !== 'application/octet-stream') {
    // Fold the common aliases onto the names the bucket lists.
    if (mime === 'audio/x-wav' || mime === 'audio/wave' || mime === 'audio/vnd.wave') return 'audio/wav'
    if (mime === 'audio/x-aiff') return 'audio/aiff'
    if (mime === 'audio/x-m4a' || mime === 'audio/m4a') return 'audio/mp4'
    if (mime === 'audio/mp3') return 'audio/mpeg'
    return mime
  }
  return 'audio/mp4'
}

/** A file extension for the storage path when there is no filename to use. */
export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
    'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff',
    'audio/x-caf': 'caf',
    'audio/flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/amr': 'amr',
    'video/quicktime': 'mov',
    'video/mp4': 'mp4',
  }
  return map[mime] ?? 'm4a'
}

export type UploadBlockedReason = 'too_large' | 'unsupported_type'

/**
 * An upload the cloud will never accept, so retrying it is pointless.
 * Recorded on the take instead of looping, and shown in Settings.
 */
export class UploadBlockedError extends Error {
  readonly reason: UploadBlockedReason

  constructor(reason: UploadBlockedReason, message: string) {
    super(message)
    this.name = 'UploadBlockedError'
    this.reason = reason
  }
}

/** Storage's own wording for the two permanent refusals. */
export function classifyStorageRefusal(message: string): UploadBlockedReason | null {
  const m = message.toLowerCase()
  if (m.includes('maximum allowed size') || m.includes('payload too large') || m.includes('413')) {
    return 'too_large'
  }
  if (m.includes('mime type') || m.includes('invalid_mime_type') || m.includes('not supported')) {
    return 'unsupported_type'
  }
  return null
}
