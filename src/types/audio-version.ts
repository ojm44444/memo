export interface AudioVersion {
  id: string
  songId: string
  label: string
  durationMs: number
  mimeType: string
  sortOrder: number
  localBlobId: string | null
  storagePath: string | null
  /** When the audio was originally recorded (from file.lastModified or ID3 tag). */
  recordedAt: string | null
  createdAt: string
  syncedAt: string | null
  /** Per-clip tags (e.g. "riff", "chorus", "demo"). Stored locally. */
  tags?: string[]
  /** Playback start offset in ms — skips the silence/intro on play. */
  trimStartMs?: number
}

export interface AudioBlob {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: string
}
