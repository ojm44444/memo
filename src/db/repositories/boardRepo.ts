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

async function matchesSharedFilters(song: Song) {
  if (song.deletedAt) return false

  const activeTag = await getActiveTagFilter()
  if (activeTag && !(song.tags ?? []).includes(activeTag)) return false

  const favouritesOnly = await getFavouritesOnlyFilter()
  if (favouritesOnly && !song.isFavourite) return false

  const titleSearch = await getTitleSearchFilter()
  if (titleSearch && !song.title.toLowerCase().includes(titleSearch.toLowerCase())) return false

  return true
}

async function matchesBoardFilters(song: Song) {
  if (!(await matchesSharedFilters(song))) return false

  const activeProjectId = await getActiveProjectScope()
  if (song.projectId && song.projectId !== activeProjectId) return false

  return true
}

async function sortSongsForDisplay(songs: Song[], columnSlug?: ColumnSlug) {
  const sortMode = await getSongSortMode()
  return [...songs].sort((a, b) => {
    if (sortMode === 'recent') {
      return b.updatedAt.localeCompare(a.updatedAt)
    }
    // Inbox always sorts by recording date desc so newest captures appear first
    if (columnSlug === 'inbox') {
      const ra = a.recordedAt ?? a.createdAt
      const rb = b.recordedAt ?? b.createdAt
      return rb.localeCompare(ra)
    }
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}

async function getSongsInColumnScope(columnSlug: ColumnSlug, projectId?: string) {
  const scopeProjectId = projectId ?? (await getActiveProjectScope())
  return db.songs
    .where('columnSlug')
    .equals(columnSlug)
    .filter((s) => !s.deletedAt && (s.projectId === scopeProjectId || s.projectId == null))
    .sortBy('sortOrder')
}

async function getSongsInColumnScopeForDisplay(columnSlug: ColumnSlug, projectId?: string) {
  const songs = await getSongsInColumnScope(columnSlug, projectId)
  const filtered: Song[] = []
  for (const song of songs) {
    if (await matchesBoardFilters(song)) filtered.push(song)
  }
  return sortSongsForDisplay(filtered, columnSlug)
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

  await db.columns.update(columnId, { title: trimmed })
  await enqueueSync('update', 'column', columnId, { title: trimmed, sortOrder: column.sortOrder })
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
  await enqueueSync('delete', 'column', columnId, { id: columnId })
}

export async function getSongsByColumn(columnSlug: ColumnSlug) {
  return getSongsInColumnScopeForDisplay(columnSlug)
}

export async function getRecentSongsAcrossLibrary(limit = 6) {
  const songs = await db.songs.filter((s) => !s.deletedAt).toArray()
  return songs
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

export async function getAllFavouriteSongs() {
  const songs = await db.songs
    .filter((s) => !s.deletedAt && s.isFavourite)
    .toArray()

  const filtered: Song[] = []
  for (const song of songs) {
    if (await matchesSharedFilters(song)) filtered.push(song)
  }

  return await sortSongsForDisplay(filtered)
}

export async function getRecentSongs(limit = 6) {
  const songs = await db.songs.filter((s) => !s.deletedAt).toArray()
  const filtered: Song[] = []

  for (const song of songs) {
    if (await matchesBoardFilters(song)) filtered.push(song)
  }

  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

export async function getFavouriteSongs() {
  const activeProjectId = await getActiveProjectScope()
  const songs = await db.songs
    .filter((s) => !s.deletedAt && s.isFavourite && s.projectId === activeProjectId)
    .toArray()

  const filtered: Song[] = []
  for (const song of songs) {
    if (await matchesBoardFilters(song)) filtered.push(song)
  }

  return await sortSongsForDisplay(filtered)
}

export async function getAllSongs() {
  const songs = await db.songs.filter((s) => !s.deletedAt).sortBy('sortOrder')
  const filtered: Song[] = []

  for (const song of songs) {
    if (await matchesBoardFilters(song)) filtered.push(song)
  }

  return await sortSongsForDisplay(filtered)
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
}) {
  const projectId = input.projectId ?? (await getActiveProjectScope())
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

export async function moveSong(
  songId: string,
  targetColumnSlug: ColumnSlug,
  targetIndex: number,
) {
  const song = await db.songs.get(songId)
  if (!song || song.deletedAt) return

  const sourceColumn = song.columnSlug
  const sourceSongs = (await getSongsInColumnScope(sourceColumn, song.projectId)).filter(
    (s) => s.id !== songId,
  )

  const targetSongs = (await getSongsInColumnScope(targetColumnSlug, song.projectId)).filter(
    (s) => s.id !== songId,
  )

  const now = new Date().toISOString()
  sourceSongs.forEach((s, i) => {
    s.sortOrder = i
    s.updatedAt = now
  })

  const clampedIndex = Math.max(0, Math.min(targetIndex, targetSongs.length))
  targetSongs.splice(clampedIndex, 0, {
    ...song,
    columnSlug: targetColumnSlug,
    sortOrder: clampedIndex,
    updatedAt: now,
  })

  targetSongs.forEach((s, i) => {
    s.sortOrder = i
    if (s.id !== songId) s.updatedAt = now
  })

  await db.transaction('rw', db.songs, async () => {
    for (const s of sourceSongs) await db.songs.put(s)
    for (const s of targetSongs) await db.songs.put(s)
  })

  const moved = targetSongs.find((s) => s.id === songId)!
  for (const s of sourceSongs) {
    await enqueueSync('update', 'song', s.id, { sortOrder: s.sortOrder, updatedAt: now })
  }
  for (const s of targetSongs) {
    if (s.id !== songId) {
      await enqueueSync('update', 'song', s.id, { sortOrder: s.sortOrder, updatedAt: now })
    }
  }
  await enqueueSync('update', 'song', songId, {
    columnSlug: moved.columnSlug,
    sortOrder: moved.sortOrder,
    updatedAt: moved.updatedAt,
  })
}

export async function reorderSongInColumn(
  songId: string,
  columnSlug: ColumnSlug,
  newIndex: number,
) {
  const song = await db.songs.get(songId)
  if (!song) return

  const songs = (await getSongsInColumnScope(columnSlug, song.projectId)).filter(
    (s) => s.id !== songId,
  )

  const now = new Date().toISOString()
  const clampedIndex = Math.max(0, Math.min(newIndex, songs.length))
  songs.splice(clampedIndex, 0, {
    ...song,
    sortOrder: clampedIndex,
    updatedAt: now,
  })

  songs.forEach((s, i) => {
    s.sortOrder = i
    if (s.id !== songId) s.updatedAt = now
  })

  await db.transaction('rw', db.songs, async () => {
    for (const s of songs) await db.songs.put(s)
  })

  const updated = songs.find((s) => s.id === songId)!
  for (const s of songs) {
    if (s.id !== songId) {
      await enqueueSync('update', 'song', s.id, { sortOrder: s.sortOrder, updatedAt: now })
    }
  }
  await enqueueSync('update', 'song', songId, {
    sortOrder: updated.sortOrder,
    updatedAt: updated.updatedAt,
  })
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
