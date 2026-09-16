export const INBOX_SLUG = 'inbox' as const

/** Where Listen-only tracks live. Not a board section: the board never shows it. */
export const LISTEN_SLUG = '__listen__'

/** Any board section slug — inbox is the fixed intake column. */
export type ColumnSlug = string

export interface Column {
  id: string
  slug: ColumnSlug
  title: string
  sortOrder: number
  /** ISO timestamp set locally when a rename is saved. Prevents stale cloud pulls from overwriting a recent rename. */
  renamedAt?: string
}
