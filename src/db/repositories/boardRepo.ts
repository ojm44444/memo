import { createId } from '@/lib/ids'
import { slugifySection } from '@/lib/slugify'
import { INBOX_SLUG, type Column, type ColumnSlug } from '@/types/column'
import type { Song } from '@/types/song'
import { db } from '../database'
import { enqueueSync } from './outboxRepo'
import {
  getActiveProjectId,
  getActiveTagFilter,
  getFavouritesOnlyFilter,
  getSongSortMode,
  getTitleSearchFilter,
} from './projectRepo'

async function getActiveProjectScope() {
  return getActiveProjectId()
}

type FilterContext = {
  activeProjectId: string | null
  activeTag: string | null
  favouritesOnly: boolean
  titleSearch: string | null
  sortMode: string
}

async function getFilterContext(): Promise<FilterContext> {
  const [activeProjectId, activeTag, favouritesOnly, titleSearch, sortMode] = await Promise.all([
    getActiveProjectScope(),
    getActiveTagFilter(),
    getFavouritesOnlyFilter(),
    getTitleSearchFilter(),
    getSongSortMode(),
  ])
  return { activeProjectId, activeTag, favouritesOnly, titleSearch, sortMode }
}

function songMatchesFilters(song: Song, ctx: FilterContext): boolean {
  if (song.deletedAt) return false
  if (ctx.activeTag && !(song.tags ?? []).includes(ctx.activeTag)) return false
  if (ctx.favouritesOnly && !song.isFavourite) return false
  if (ctx.titleSearch && !song.title.toLowerCase().includes(ctx.titleSearch.toLowerCase())) return false
  if (song.projectId && song.projectId !== ctx.activeProjectId) return false
  return true
}

function sortSongsSync(songs: Song[], columnSlug: ColumnSlug | undefined, sortMode: string): Song[] {
  return [...songs].sort((a, b) => {
    if (sortMode === 'recent') return b.updatedAt.localeCompare(a.updatedAt)
    if (columnSlug === 'inbox') {
      const ra = a.recordedAt ?? a.createdAt
      const rb = b.recordedAt ?? b.createdAt
      return rb.localeCompare(ra)
    }
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}

async function getSongsInColumnScope(columnSlug: ColumnSlug, projectId?: string | null) {
  const scopeProjectId = projectId ?? (await getActiveProjectScope())
  return db.songs
    .where('columnSlug')
    .equals(columnSlug)
    .filter((s) => !s.deletedAt && (s.projectId === scopeProjectId || s.projectId == null))
    .sortBy('sortOrder')
}

async function getSongsInColumnScopeForDisplay(columnSlug: ColumnSlug, projectId?: string | null) {
  const [songs, ctx] = await Promise.all([
    getSongsInColumnScope(columnSlug, projectId),
    getFilterContext(),
  ])
  const filtered = songs.filter((s) => songMatchesFilters(s, ctx))
  return sortSongsSync(filtered, columnSlug, ctx.sortMode)
}

export async function getColumns() {
  return db.columns.orderBy('sortOrder').toArray()
}

export async function ensureColumnsExist(titles: string[]) {
  const columns = await getColumns()
  const existingSlugs = new Set(columns.map((column) => column.slug))
  let sortOrder = columns.length

  for (const title of titles) {
    const trimmed = title.trim()
    if (!trimmed) continue

    let slug = slugifySection(trimmed)
    if (slug === INBOX_SLUG) slug = `${slug}-section`
    if (existingSlugs.has(slug)) continue

    const column: Column = {
      id: createId(),
      slug,
      title: trimmed,
      sortOrder,
    }

    await db.columns.add(column)
    await enqueueSync('create', 'column', column.id, column)
    existingSlugs.add(slug)
    sortOrder++
  }
}

export async function createColumn(title: string) {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Section name is required')

  const columns = await getColumns()
  let slug = slugifySection(trimmed)
  if (slug === INBOX_SLUG) slug = `${slug}-section`

  const taken = columns.some((c) => c.slug === slug)
  if (taken) throw new Error('A section with that name already exists')

  const column: Column = {
    id: createId(),
    slug,
    title: trimmed,
    sortOrder: columns.length,
  }

  await db.columns.add(column)
  await enqueueSync('create', 'column', column.id, column)
  return column
}

export async function renameColumn(columnId: string, title: string) {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Section name is required')

  const column = await db.columns.get(columnId)
  if (!column) throw new Error('Section not found')
  if (column.slug === INBOX_SLUG) throw new Error('Inbox cannot be renamed')

  const renamedAt = new Date().toISOString()
  await db.columns.update(columnId, { title: trimmed, renamedAt })
  await enqueueSync('update', 'column', columnId, { title: trimmed, slug: column.slug, sortOrder: column.sortOrder })
}

export async function deleteColumn(columnId: string) {
  const column = await db.columns.get(columnId)
  if (!column) return
  if (column.slug === INBOX_SLUG) throw new Error('Inbox cannot be deleted')

  const songs = await getSongsByColumn(column.slug)
  for (const song of songs) {
    await moveSong(song.id, INBOX_SLUG, 999)
  }

  await db.columns.delete(columnId)
  await enqueueSync('delete', 'column', columnId, { id: columnId, slug: column.slug })
}

export async function getSongsByColumn(columnSlug: ColumnSlug) {
  return getSongsInColumnScopeForDisplay(columnSlug)
}

export async function getSongsInColumnForReorder(columnSlug: ColumnSlug) {
  return getSongsInColumnScope(columnSlug)
}

export async function getColumnSongCounts(columnSlugs: string[]): Promise<Record<string, number>> {
  const ctx = await getFilterContext()
  const counts: Record<string, number> = {}
  await Promise.all(
    columnSlugs.map(async (slug) => {
      const songs = await getSongsInColumnScope(slug as ColumnSlug)
      counts[slug] = songs.filter((s) => songMatchesFilters(s, ctx)).length
    }),
  )
  return counts
}

export async function getRecentSongsAcrossLibrary(limit = 6) {
  const songs = await db.songs.orderBy('updatedAt').reverse().filter((s) => !s.deletedAt).limit(limit * 3).toArray()
  return songs.slice(0, limit)
}

export async function getAllFavouriteSongs() {
  const [songs, ctx] = await Promise.all([
    db.songs.filter((s) => !s.deletedAt && s.isFavourite).toArray(),
    getFilterContext(),
  ])
  const filtered = songs.filter((s) => songMatchesFilters(s, ctx))
  return sortSongsSync(filtered, undefined, ctx.sortMode)
}

export async function getRecentSongs(limit = 6) {
  const [songs, ctx] = await Promise.all([
    db.songs.orderBy('updatedAt').reverse().filter((s) => !s.deletedAt).limit(limit * 5).toArray(),
    getFilterContext(),
  ])
  return songs.filter((s) => songMatchesFilters(s, ctx)).slice(0, limit)
}

export async function getFavouriteSongs() {
  const [songs, ctx] = await Promise.all([
    db.songs.filter((s) => !s.deletedAt && s.isFavourite).toArray(),
    getFilterContext(),
  ])
  return sortSongsSync(songs.filter((s) => songMatchesFilters(s, ctx)), undefined, ctx.sortMode)
}

export async function getAllSongs() {
  const [songs, ctx] = await Promise.all([
    db.songs.filter((s) => !s.deletedAt).sortBy('sortOrder'),
    getFilterContext(),
  ])
  return sortSongsSync(songs.filter((s) => songMatchesFilters(s, ctx)), undefined, ctx.sortMode)
}

export async function toggleSongFavourite(id: string) {
  const song = await db.songs.get(id)
  if (!song || song.deletedAt) return null
  return updateSong(id, { isFavourite: !song.isFavourite })
}

export async function getSong(id: string) {
  return db.songs.get(id)
}

export async function createSong(input: {
  title: string
  columnSlug: ColumnSlug
  notes?: string
  tags?: string[]
  projectId?: string
  musicalKey?: string | null
  bpm?: number | null
  recordedAt?: string | null
  locationName?: string | null
}) {
  // Inbox songs have no project until the user tags them
  const projectId = input.columnSlug === 'inbox' && !input.projectId
    ? null
    : (input.projectId ?? (await getActiveProjectScope()))
  const songsInColumn = await getSongsInColumnScope(input.columnSlug, projectId)
  const now = new Date().toISOString()

  const song: Song = {
    id: createId(),
    title: input.title,
    columnSlug: input.columnSlug,
    projectId,
    tags: input.tags ?? [],
    isFavourite: false,
    musicalKey: input.musicalKey ?? null,
    bpm: input.bpm ?? null,
    recordedAt: input.recordedAt ?? null,
    locationName: input.locationName ?? null,
    sortOrder: songsInColumn.length,
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
    deletedAt: null,
  }

  await db.songs.add(song)
  await enqueueSync('create', 'song', song.id, song)
  return song
}

export async function updateSong(
  id: string,
  patch: Partial<
    Pick<Song, 'title' | 'notes' | 'tags' | 'projectId' | 'isFavourite' | 'musicalKey' | 'bpm'>
  >,
) {
  const song = await db.songs.get(id)
  if (!song) return null

  const updated: Song = {
    ...song,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  await db.songs.put(updated)
  await enqueueSync('update', 'song', id, updated)
  return updated
}

export async function moveSongToProject(songId: string, targetProjectId: string) {
  const song = await db.songs.get(songId)
  if (!song || song.deletedAt || song.projectId === targetProjectId) return null

  const sourceSongs = (await getSongsInColumnScope(song.columnSlug, song.projectId)).filter(
    (entry) => entry.id !== songId,
  )
  const now = new Date().toISOString()
  sourceSongs.forEach((entry, index) => {
    entry.sortOrder = index
    entry.updatedAt = now
  })

  const targetSongs = await getSongsInColumnScope(song.columnSlug, targetProjectId)
  const updated: Song = {
    ...song,
    projectId: targetProjectId,
    sortOrder: targetSongs.length,
    updatedAt: now,
  }

  await db.transaction('rw', db.songs, async () => {
    for (const entry of sourceSongs) await db.songs.put(entry)
    await db.songs.put(updated)
  })

  for (const entry of sourceSongs) {
    await enqueueSync('update', 'song', entry.id, { sortOrder: entry.sortOrder, updatedAt: now })
  }
  await enqueueSync('update', 'song', songId, updated)
  return updated
}

async function computeInsertSortOrder(
  targetColumnSlug: ColumnSlug,
  projectId: string | null,
  beforeSongId: string | undefined,
  excludeSongId: string,
): Promise<number> {
  if (beforeSongId) {
    const beforeSong = await db.songs.get(beforeSongId)
    if (beforeSong) {
      // Find the song just before it in the column to compute a midpoint
      const siblings = await db.songs
        .where('columnSlug')
        .equals(targetColumnSlug)
        .filter((s) => !s.deletedAt && s.id !== excludeSongId && (s.projectId === projectId || s.projectId == null))
        .sortBy('sortOrder')
      const beforeIdx = siblings.findIndex((s) => s.id === beforeSongId)
      const prev = beforeIdx > 0 ? siblings[beforeIdx - 1] : null
      return prev
        ? (prev.sortOrder + beforeSong.sortOrder) / 2
        : beforeSong.sortOrder - 1024
    }
  }
  // Append: count existing songs in target
  const count = await db.songs
    .where('columnSlug')
    .equals(targetColumnSlug)
    .filter((s) => !s.deletedAt && s.id !== excludeSongId && (s.projectId === projectId || s.projectId == null))
    .count()
  return count
}

export async function moveSong(
  songId: string,
  targetColumnSlug: ColumnSlug,
  _targetIndex: number,
  beforeSongId?: string,
) {
  const song = await db.songs.get(songId)
  if (!song || song.deletedAt) return

  const now = new Date().toISOString()
  const sortOrder = await computeInsertSortOrder(targetColumnSlug, song.projectId, beforeSongId, songId)

  const updated: Song = { ...song, columnSlug: targetColumnSlug, sortOrder, updatedAt: now }
  await db.songs.put(updated)
  void enqueueSync('update', 'song', songId, { columnSlug: targetColumnSlug, sortOrder, updatedAt: now })
}

export async function reorderSongInColumn(
  songId: string,
  columnSlug: ColumnSlug,
  _newIndex: number,
  beforeSongId?: string,
) {
  const song = await db.songs.get(songId)
  if (!song) return

  const now = new Date().toISOString()
  const sortOrder = await computeInsertSortOrder(columnSlug, song.projectId, beforeSongId, songId)

  const updated: Song = { ...song, sortOrder, updatedAt: now }
  await db.songs.put(updated)
  void enqueueSync('update', 'song', songId, { sortOrder, updatedAt: now })
}

export async function deleteSong(id: string) {
  const song = await db.songs.get(id)
  if (!song) return

  const deleted: Song = {
    ...song,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.songs.put(deleted)
  await enqueueSync('delete', 'song', id, { id })

  const remaining = (await getSongsInColumnScope(song.columnSlug, song.projectId)).filter(
    (s) => s.id !== id,
  )

  const now = new Date().toISOString()
  remaining.forEach((s, i) => {
    s.sortOrder = i
    s.updatedAt = now
  })
  await db.transaction('rw', db.songs, async () => {
    for (const s of remaining) await db.songs.put(s)
  })
  for (const s of remaining) {
    await enqueueSync('update', 'song', s.id, { sortOrder: s.sortOrder, updatedAt: now })
  }
}

export async function bulkMoveSongs(songIds: string[], targetColumnSlug: ColumnSlug) {
  const uniqueIds = [...new Set(songIds)]
  if (!uniqueIds.length) return

  const projectId = await getActiveProjectScope()
  const targetSongs = await getSongsInColumnScope(targetColumnSlug, projectId)
  let nextIndex = targetSongs.length

  for (const songId of uniqueIds) {
    const song = await db.songs.get(songId)
    if (!song || song.deletedAt || song.projectId !== projectId) continue
    if (song.columnSlug === targetColumnSlug) continue
    await moveSong(songId, targetColumnSlug, nextIndex)
    nextIndex++
  }
}

export async function bulkAddTagToSongs(songIds: string[], tag: string) {
  const normalized = tag.trim().toLowerCase()
  if (!normalized) return

  const uniqueIds = [...new Set(songIds)]
  for (const songId of uniqueIds) {
    const song = await db.songs.get(songId)
    if (!song || song.deletedAt) continue
    if ((song.tags ?? []).includes(normalized)) continue
    await updateSong(songId, { tags: [...(song.tags ?? []), normalized] })
  }
}

export async function bulkFavouriteSongs(songIds: string[]) {
  const uniqueIds = [...new Set(songIds)]
  for (const songId of uniqueIds) {
    const song = await db.songs.get(songId)
    if (!song || song.deletedAt || song.isFavourite) continue
    await updateSong(songId, { isFavourite: true })
  }
}

export async function getSongIdsInActiveProject() {
  const projectId = await getActiveProjectScope()
  const songs = await db.songs
    .filter((song) => !song.deletedAt && song.projectId === projectId)
    .toArray()
  return songs.map((song) => song.id)
}

export async function bulkUnfavouriteSongs(songIds: string[]) {
  const uniqueIds = [...new Set(songIds)]
  for (const songId of uniqueIds) {
    const song = await db.songs.get(songId)
    if (!song || song.deletedAt || !song.isFavourite) continue
    await updateSong(songId, { isFavourite: false })
  }
}

export async function bulkDeleteSongs(songIds: string[]) {
  const uniqueIds = [...new Set(songIds)]
  for (const songId of uniqueIds) {
    await deleteSong(songId)
  }
}

export async function mergeSongsInto(targetSongId: string, sourceSongIds: string[]) {
  const target = await db.songs.get(targetSongId)
  if (!target || target.deletedAt) return

  const uniqueSources = sourceSongIds.filter((id) => id !== targetSongId)
  if (uniqueSources.length === 0) return

  let notes = target.notes
  let versionOffset = await db.audioVersions.where('songId').equals(targetSongId).count()

  for (const sourceId of uniqueSources) {
    const source = await db.songs.get(sourceId)
    if (!source || source.deletedAt) continue

    const versions = await db.audioVersions.where('songId').equals(sourceId).sortBy('sortOrder')
    for (const version of versions) {
      await db.audioVersions.update(version.id, {
        songId: targetSongId,
        sortOrder: versionOffset++,
      })
    }

    const links = await db.songLinks.where('songId').equals(sourceId).toArray()
    for (const link of links) {
      await db.songLinks.update(link.id, { songId: targetSongId })
    }

    if (source.notes.trim()) {
      notes = notes.trim()
        ? `${notes}\n\n— merged from "${source.title}" —\n${source.notes}`
        : source.notes
    }

    await deleteSong(sourceId)
  }

  if (notes !== target.notes) {
    await updateSong(targetSongId, { notes })
  } else {
    await db.songs.update(targetSongId, { updatedAt: new Date().toISOString() })
    await enqueueSync('update', 'song', targetSongId, {
      updatedAt: new Date().toISOString(),
    })
  }
}
