import { db } from '@/db/database'
import { enqueueSync } from '@/db/repositories/outboxRepo'
import { createSong, updateSong } from '@/db/repositories/boardRepo'
import { supabase } from '@/lib/supabase/client'
import { getBoardUserId } from '@/lib/auth/session'
import { resolveBoardId } from '@/lib/supabase/boardAccess'
import { createId } from '@/lib/ids'
import type { ListenProject } from '@/types/listen-project'
import type { AudioBlob, AudioVersion } from '@/types/audio-version'
import type { ColumnSlug } from '@/types/column'
import type { Song } from '@/types/song'

/**
 * Projects in Listen (039). Written to this device first and pushed through
 * the outbox, like everything else, so a project made on a train exists before
 * the train reaches signal.
 */

export async function getListenProjects(): Promise<ListenProject[]> {
  /* Read first, before any await: live queries lose track of reads issued
     after an await in Dexie 4 (the ghost-card bug of 11 Sept). */
  const rows = await db.listenProjects.toArray()
  return rows.filter((p) => !p.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
}

export async function getListenProject(id: string) {
  const row = await db.listenProjects.get(id)
  return row && !row.deletedAt ? row : undefined
}

/** No two playlists share a name: blank is "Untitled 1", "Untitled 2"; a repeat gets a number. */
async function uniqueTitle(wanted: string, exceptId?: string) {
  const taken = new Set(
    (await db.listenProjects.toArray())
      .filter((p) => !p.deletedAt && p.id !== exceptId)
      .map((p) => p.title.trim().toLowerCase()),
  )
  const base = wanted.trim()
  if (base && !taken.has(base.toLowerCase())) return base
  const stem = base || 'Untitled'
  for (let n = base ? 2 : 1; ; n++) {
    const candidate = `${stem} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export async function createListenProject(input: {
  title: string
  artist?: string | null
  coverPath?: string | null
}): Promise<ListenProject> {
  const now = new Date().toISOString()
  const count = await db.listenProjects.filter((p) => !p.deletedAt).count()
  const project: ListenProject = {
    id: createId(),
    title: await uniqueTitle(input.title),
    artist: input.artist?.trim() || null,
    coverPath: input.coverPath ?? null,
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.listenProjects.add(project)
  await enqueueSync('create', 'listen_project', project.id, project)
  return project
}

export interface DuplicateListenProjectResult {
  project: ListenProject
  songsCopied: number
  clipsCopied: number
  clipsSkipped: number
  /** A song that failed outright, title and why. Empty on a clean run. */
  songFailures: string[]
}

type RemoteSong = {
  id: string
  column_slug: string
  title: string
  notes: string | null
  tags: string[] | null
  musical_key: string | null
  bpm: number | null
  project_id: string | null
  listen_position: number | null
}

type RemoteVersion = {
  id: string
  storage_path: string | null
  file_name: string | null
  label: string | null
  duration_ms: number | null
  position: number | null
}

/** Download one take from cloud storage and add it as a new local clip. */
async function cloneRemoteVersion(songId: string, remote: RemoteVersion): Promise<boolean> {
  if (!remote.storage_path || !supabase) return false
  try {
    const { data, error } = await supabase.storage.from('audio').download(remote.storage_path)
    if (error || !data) return false

    const blobId = createId()
    const blob: AudioBlob = {
      id: blobId,
      blob: data,
      mimeType: data.type || 'audio/mp4',
      size: data.size,
      createdAt: new Date().toISOString(),
    }
    const versionId = createId()
    const label = remote.label || 'Take'
    const now = new Date().toISOString()
    const version: AudioVersion = {
      id: versionId,
      songId,
      label,
      durationMs: remote.duration_ms ?? 0,
      mimeType: blob.mimeType,
      sortOrder: remote.position ?? 0,
      localBlobId: blobId,
      storagePath: null,
      recordedAt: null,
      createdAt: now,
      syncedAt: null,
    }

    await db.audioBlobs.add(blob)
    await db.audioVersions.add(version)
    await enqueueSync('upload', 'audio_version', versionId, {
      versionId,
      songId,
      fileName: remote.file_name || `${label}.audio`,
      mimeType: blob.mimeType,
      durationMs: version.durationMs,
      sortOrder: version.sortOrder,
      label,
      localBlobId: blobId,
    })
    return true
  } catch (err) {
    // A clip failing to clone must never take the song down with it: the
    // song still belongs in the new playlist, just with one fewer take.
    console.error('[songdrafts] cloneRemoteVersion failed for', remote.label, err)
    return false
  }
}

/**
 * Copy a playlist: a new playlist, same title (deduped), artist and cover,
 * with its own copy of every track (23 Sept, Owen).
 *
 * Reads the source from the cloud, not this device's local mirror. A
 * playlist is something you make to send, so duplicating one has to work
 * from whichever device you happen to be on, not only the one the songs
 * were first imported on. Falls back to the local copy if there is no
 * connection (offline) or nothing signed in.
 *
 * A song belongs to at most one playlist (listenProjectId is a single
 * field, not a list), so the only way for the same track to sit in two
 * playlists at once is two separate songs, each with its own copy of the
 * audio. clipsSkipped counts a take that was never finished uploading
 * anywhere, so there is nothing to copy yet.
 */
export async function duplicateListenProject(sourceId: string): Promise<DuplicateListenProjectResult> {
  const source = await db.listenProjects.get(sourceId)
  if (!source || source.deletedAt) throw new Error('Playlist not found')

  const project = await createListenProject({
    title: `${source.title} (copy)`,
    artist: source.artist,
    coverPath: source.coverPath,
  })

  let remoteSongs: RemoteSong[] | null = null
  if (supabase) {
    try {
      const userId = await getBoardUserId()
      const boardId = userId ? await resolveBoardId(userId) : null
      if (boardId) {
        // listen_project_id / listen_position are real columns (039) but the
        // generated types haven't been refreshed to know them, so this one
        // query goes through untyped, same as the RPCs below it in the file.
        const { data, error } = await (supabase as any)
          .from('songs')
          .select('id, column_slug, title, notes, tags, musical_key, bpm, project_id, listen_position')
          .eq('board_id', boardId)
          .eq('listen_project_id', sourceId)
          .is('deleted_at', null)
          .order('listen_position', { ascending: true })
        if (!error) remoteSongs = (data as RemoteSong[] | null) ?? []
      }
    } catch {
      // Offline or the request failed: fall through to the local copy below.
    }
  }

  let clipsCopied = 0
  let clipsSkipped = 0
  let songsCopied = 0
  let position = 0
  /* One song failing (a bad field, a dropped connection mid-loop) used to
     abort every song after it, silently, and the copy that resulted looked
     no different from a genuine empty playlist — exactly what happened to
     Owen's first two tries (23 Sept). Now a song that fails is skipped, not
     fatal, and if every one of them failed the real reason is thrown so it
     reaches the alert instead of a playlist that quietly has nothing in it. */
  const failures: string[] = []

  if (remoteSongs) {
    for (const remote of remoteSongs) {
      let newSongId: string | null = null
      try {
        const newSong = await createSong({
          title: remote.title,
          columnSlug: remote.column_slug as ColumnSlug,
          notes: remote.notes ?? undefined,
          tags: Array.isArray(remote.tags) ? remote.tags : undefined,
          projectId: remote.project_id ?? undefined,
          musicalKey: remote.musical_key,
          bpm: remote.bpm,
        })
        newSongId = newSong.id

        // Linked into the new playlist right away, before touching any
        // audio: if a take fails to clone below, the song still belongs
        // here with whatever takes it did get, rather than sitting
        // unlinked and invisible while looking like nothing was copied.
        await updateSong(newSong.id, { listenProjectId: project.id, listenPosition: position++ })
        songsCopied++

        const { data: versions, error } = await supabase!
          .from('audio_versions')
          .select('id, storage_path, file_name, label, duration_ms, position')
          .eq('song_id', remote.id)
          .order('position', { ascending: true })
        if (error) throw error

        for (const remoteVersion of ((versions as RemoteVersion[] | null) ?? [])) {
          if (await cloneRemoteVersion(newSong.id, remoteVersion)) clipsCopied++
          else clipsSkipped++
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[songdrafts] duplicateListenProject: could not copy', remote.title, newSongId, err)
        failures.push(`${remote.title}: ${message}`)
      }
    }
    if (songsCopied === 0 && failures.length > 0) {
      throw new Error(`Could not copy any tracks. ${failures[0]}`)
    }
  } else {
    // Offline, or signed out of cloud: whatever this device already has.
    const songs = (await db.songs.where('listenProjectId').equals(sourceId).toArray()) as Song[]
    songs.sort((a, b) => (a.listenPosition ?? 0) - (b.listenPosition ?? 0))

    const { duplicateSong } = await import('./audioRepo')
    for (const song of songs) {
      const result = await duplicateSong(song.id, { title: song.title })
      await updateSong(result.song.id, { listenProjectId: project.id, listenPosition: position++ })
      clipsCopied += result.clipsCopied
      clipsSkipped += result.clipsSkipped
    }
    songsCopied = songs.length
  }

  return { project, songsCopied, clipsCopied, clipsSkipped, songFailures: failures }
}

export async function updateListenProject(
  id: string,
  patch: Partial<Pick<ListenProject, 'title' | 'artist' | 'coverPath' | 'sortOrder'>>,
) {
  const project = await db.listenProjects.get(id)
  if (!project) return null
  if (patch.title !== undefined) patch = { ...patch, title: await uniqueTitle(patch.title, id) }
  const updated: ListenProject = { ...project, ...patch, updatedAt: new Date().toISOString() }
  await db.listenProjects.put(updated)
  await enqueueSync('update', 'listen_project', id, updated)
  return updated
}

/** Deleting a project never deletes music: its songs go back to "Not in a project". */
export async function deleteListenProject(id: string) {
  const songs = await db.songs.where('listenProjectId').equals(id).toArray()
  for (const song of songs) await updateSong(song.id, { listenProjectId: null, listenPosition: null })
  const project = await db.listenProjects.get(id)
  if (!project) return
  const now = new Date().toISOString()
  const deleted: ListenProject = { ...project, deletedAt: now, updatedAt: now }
  await db.listenProjects.put(deleted)
  await enqueueSync('delete', 'listen_project', id, deleted)
}

/** Put songs (their whole stacks) into a project, after whatever is already there. */
export async function moveSongsToListenProject(songIds: string[], projectId: string | null) {
  let next = 0
  if (projectId) {
    const inProject = await db.songs.where('listenProjectId').equals(projectId).toArray()
    next = inProject.reduce((max, s) => Math.max(max, (s.listenPosition ?? -1) + 1), 0)
  }
  for (const songId of songIds) {
    const song = await db.songs.get(songId)
    if (!song || (song.listenProjectId ?? null) === projectId) continue
    await updateSong(songId, { listenProjectId: projectId, listenPosition: projectId ? next++ : null })
  }
}

/** Save a new running order for a project's songs. */
export async function reorderListenProject(songIdsInOrder: string[]) {
  for (const [index, songId] of songIdsInOrder.entries()) {
    const song = await db.songs.get(songId)
    if (song && song.listenPosition !== index) await updateSong(songId, { listenPosition: index })
  }
}

const coverUrls = new Map<string, Promise<string | null>>()

/** A viewable URL for a project cover in your own storage, cached per path. */
export function listenCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path || !supabase) return Promise.resolve(null)
  const cached = coverUrls.get(path)
  if (cached) return cached
  const request = supabase.storage
    .from('audio')
    .createSignedUrl(path, 60 * 60 * 12)
    .then(({ data }) => data?.signedUrl ?? null)
    .catch(() => null)
  coverUrls.set(path, request)
  return request
}
