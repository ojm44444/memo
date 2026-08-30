import type { ColumnSlug } from './column'

export interface Song {
  id: string
  title: string
  columnSlug: ColumnSlug
  projectId: string | null
  tags: string[]
  isFavourite: boolean
  /** Optional — set from file metadata or drawer; never auto-detected from audio */
  musicalKey: string | null
  /**
   * Alternate tuning, free text (DADGAD, Open D, half step down).
   *
   * From the threads: someone spent 50 hours on a guitar piece in an alternate
   * tuning, produced 70 near-identical memos, never wrote the tuning down, and
   * cannot play the piece any more. Key and BPM come off the file; tuning
   * cannot, so it has to be a field.
   */
  tuning?: string | null
  bpm: number | null
  sortOrder: number
  notes: string
  /**
   * The words, kept with the recording.
   *
   * The most requested thing across twelve r/Songwriting threads, ahead of
   * search, merge and sharing. WHITESPACE IS SIGNIFICANT: the near-universal
   * hack today is an Apple Note with chords written above the lyrics, and a
   * chord chart is positioned with spaces. Rendered in a monospace field and
   * stored verbatim so those charts survive.
   */
  lyrics?: string | null
  /** When the audio was originally recorded (from file.lastModified or ID3 tag). */
  recordedAt: string | null
  /** Original ID3 title (e.g. iPhone location name like "Obermattliebweg 4") when it
   *  differs from the filename. Shown as a subtitle under the card title. */
  locationName?: string | null
  createdAt: string
  updatedAt: string
  syncedAt: string | null
  deletedAt: string | null
}

export interface SongLink {
  id: string
  songId: string
  url: string
  label: string
  createdAt: string
}
