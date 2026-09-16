import { db } from '@/db/database'
import { enqueueSync } from '@/db/repositories/outboxRepo'
import { updateSong } from '@/db/repositories/boardRepo'
import { supabase } from '@/lib/supabase/client'
import { createId } from '@/lib/ids'
import type { ListenProject } from '@/types/listen-project'

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

export async function createListenProject(input: {
  title: string
  artist?: string | null
  coverPath?: string | null
}): Promise<ListenProject> {
  const now = new Date().toISOString()
  const count = await db.listenProjects.filter((p) => !p.deletedAt).count()
  const project: ListenProject = {
    id: createId(),
    title: input.title.trim() || 'Untitled',
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

export async function updateListenProject(
  id: string,
  patch: Partial<Pick<ListenProject, 'title' | 'artist' | 'coverPath' | 'sortOrder'>>,
) {
  const project = await db.listenProjects.get(id)
  if (!project) return null
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
