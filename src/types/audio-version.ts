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
}

export interface AudioBlob {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: string
}
