/**
 * A project in Listen: a release (an EP, a single, a session), with the title,
 * artist and cover it goes out under. Not the Songwriting board's projects.
 * A song's stack of demos, mixes and masters belongs to at most one.
 */
export interface ListenProject {
  id: string
  title: string
  artist: string | null
  coverPath: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
