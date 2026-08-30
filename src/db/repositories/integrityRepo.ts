import { db } from '../database'

/**
 * Import integrity: find cards whose audio is missing.
 *
 * A card with no take is the scariest state this product can be in. To the
 * person looking at it, an empty card and lost music are indistinguishable,
 * and this app holds unreleased songs.
 *
 * importAudioFiles is now atomic, so new orphans cannot be created. This finds
 * the ones already on a board from before that fix, and separates the two
 * cases that matter:
 *
 *  - RECOVERABLE: the song has a version row, and that version has a cloud
 *    path. The audio exists; this device just has not pulled it yet. Nothing
 *    is lost and it needs no action.
 *  - ORPHANED: the song has no version at all. Either an import failed
 *    half-way, or every take was moved onto another song by a merge, which is
 *    what happened to Owen's "Route de Chabanais 5".
 */
export type OrphanSong = {
  id: string
  title: string
  columnSlug: string
}

export async function findSongsWithoutTakes(): Promise<OrphanSong[]> {
  const songs = await db.songs.filter((s) => !s.deletedAt).toArray()
  const out: OrphanSong[] = []

  for (const song of songs) {
    const count = await db.audioVersions.where('songId').equals(song.id).count()
    if (count === 0) {
      out.push({ id: song.id, title: song.title, columnSlug: song.columnSlug })
    }
  }

  return out
}

/**
 * A take whose bytes are on neither this device nor the cloud is genuinely
 * unrecoverable. Anything with a storagePath is safe and simply not downloaded
 * here yet, which is a very different thing and must never be reported as loss.
 */
export async function findUnrecoverableVersions(): Promise<
  { songId: string; versionId: string; label: string }[]
> {
  const versions = await db.audioVersions.toArray()
  const out: { songId: string; versionId: string; label: string }[] = []

  for (const v of versions) {
    const hasCloud = !!v.storagePath
    if (hasCloud) continue
    const blob = v.localBlobId ? await db.audioBlobs.get(v.localBlobId) : undefined
    if (!blob) {
      out.push({ songId: v.songId, versionId: v.id, label: v.label })
    }
  }

  return out
}

export type IntegrityReport = {
  songsWithoutTakes: OrphanSong[]
  unrecoverableVersions: { songId: string; versionId: string; label: string }[]
}

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const [songsWithoutTakes, unrecoverableVersions] = await Promise.all([
    findSongsWithoutTakes(),
    findUnrecoverableVersions(),
  ])
  return { songsWithoutTakes, unrecoverableVersions }
}
