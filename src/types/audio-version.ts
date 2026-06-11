export interface AudioVersion {
  id: string
  songId: string
  label: string
  durationMs: number
  mimeType: string
  sortOrder: number
  localBlobId: string | null
  storagePath: string | null
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
