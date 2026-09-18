/** take: a private rough recording (Songwriting). demo, mix, master: Listen. */
export type TakeKind = 'take' | 'demo' | 'mix' | 'master'

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
  kind?: TakeKind
  /** Playback start offset in ms — skips the silence/intro on play. */
  trimStartMs?: number
  /**
   * Set when the cloud will never accept this take (too large, or a format the
   * bucket refuses), so the upload is not retried and the take is listed in
   * Settings as not backed up. Local only; the take still plays here.
   */
  uploadBlockedReason?: 'too_large' | 'unsupported_type' | null
  /** Playback end offset in ms — stops playback early when set. */
  trimEndMs?: number
  /**
   * The song this take lived on before a merge moved it. Local only. Unlink
   * uses it to put the take back on its own card (the merged-away song is
   * soft-deleted, not gone, so its tags, notes and comments come back too).
   */
  mergedFromSongId?: string
}

export interface AudioBlob {
  id: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: string
}
