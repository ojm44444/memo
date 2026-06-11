export interface SongComment {
  id: string
  songId: string
  userId: string
  authorLabel: string
  body: string
  createdAt: string
  updatedAt: string
  syncedAt: string | null
  deletedAt: string | null
}
