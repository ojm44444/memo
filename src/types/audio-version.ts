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
  /**
   * What this take IS.
   *
   * 'take' is your own recording, which is everything on the board. 'mix' and
   * 'master' came back from a producer or engineer, and are what Listen shows.
   * The distinction is about audience, not audio: takes are private and messy,
   * mixes are the thing you play to the band.
   */
  kind?: 'take' | 'mix' | 'master'
  /** Playback start offset in ms — skips the silence/intro on play. */
  trimStartMs?: number
  /** Playback end offset in ms — stops playback early when set. */
  trimEndMs?: number
}

export interface AudioBlob {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: string
}
