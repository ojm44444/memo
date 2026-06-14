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
  bpm: number | null
  sortOrder: number
  notes: string
  /** When the audio was originally recorded (from file.lastModified or ID3 tag). */
  recordedAt: string | null
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
