import { INBOX_SLUG, type ColumnSlug } from '@/types/column'

export const DEFAULT_COLUMNS: { slug: ColumnSlug; title: string; sortOrder: number }[] = [
  { slug: INBOX_SLUG, title: 'Inbox', sortOrder: 0 },
]

export const AUDIO_MIME_ALLOWLIST = [
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
]

export const PLAYBACK_RATES = [1, 1.5, 2] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]
