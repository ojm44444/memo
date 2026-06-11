export const INBOX_SLUG = 'inbox' as const

/** Any board section slug — inbox is the fixed intake column. */
export type ColumnSlug = string

export interface Column {
  id: string
  slug: ColumnSlug
  title: string
  sortOrder: number
}
