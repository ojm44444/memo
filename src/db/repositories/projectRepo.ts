import { createId } from '@/lib/ids'
import type { Project } from '@/types/project'
import { db } from '../database'
import { enqueueSync } from './outboxRepo'

const PROJECT_NAME_KEY = 'projectName'
const ACTIVE_PROJECT_KEY = 'activeProjectId'
const ACTIVE_TAG_KEY = 'activeTagFilter'
const FAVOURITES_ONLY_KEY = 'favouritesOnlyFilter'
const TITLE_SEARCH_KEY = 'titleSearchFilter'
const SONG_SORT_KEY = 'songSortMode'
const PINNED_PROJECT_KEY = 'pinnedProjectId'
const ARCHIVED_PROJECTS_KEY = 'archivedProjectIds'
const LAST_ACTIVE_PROJECT_KEY = 'lastActiveProjectId'
const PROJECT_ACCENTS_KEY = 'projectAccentHues'

export type SongSortMode = 'board' | 'recent'
const DEFAULT_NAME = 'My Project'

export async function getProjectAccentMap(): Promise<Record<string, number>> {
  const meta = await db.syncMeta.get(PROJECT_ACCENTS_KEY)
  if (!meta?.value) return {}
  try {
    const parsed = JSON.parse(meta.value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, number> = {}
    for (const [projectId, hue] of Object.entries(parsed)) {
      if (typeof hue === 'number' && Number.isFinite(hue)) {
        map[projectId] = Math.round(hue) % 360
      }
    }
    return map
  } catch {
    return {}
  }
}

export async function getProjectAccentHue(projectId: string) {
  const map = await getProjectAccentMap()
  return map[projectId] ?? null
}

export async function setProjectAccentHue(projectId: string, hue: number | null) {
  const map = await getProjectAccentMap()
  if (hue === null) {
    delete map[projectId]
  } else {
    map[projectId] = Math.round(hue) % 360
  }

  if (Object.keys(map).length === 0) {
    await db.syncMeta.delete(PROJECT_ACCENTS_KEY)
  } else {
    await db.syncMeta.put({ key: PROJECT_ACCENTS_KEY, value: JSON.stringify(map) })
  }
}

export async function getArchivedProjectIds(): Promise<string[]> {
  const meta = await db.syncMeta.get(ARCHIVED_PROJECTS_KEY)
  if (!meta?.value) return []
  try {
    const parsed = JSON.parse(meta.value) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function setArchivedProjectIds(ids: string[]) {
  if (ids.length === 0) {
    await db.syncMeta.delete(ARCHIVED_PROJECTS_KEY)
    return
  }
  await db.syncMeta.put({ key: ARCHIVED_PROJECTS_KEY, value: JSON.stringify(ids) })
}

async function sortProjectsWithPin(projects: Project[]) {
  const pinnedId = (await db.syncMeta.get(PINNED_PROJECT_KEY))?.value ?? null
  if (!pinnedId) return projects

  const pinned = projects.find((project) => project.id === pinnedId)
  if (!pinned) return projects

  return [pinned, ...projects.filter((project) => project.id !== pinnedId)]
}

export async function getPinnedProjectId() {
  return (await db.syncMeta.get(PINNED_PROJECT_KEY))?.value ?? null
}

export async function toggleProjectPin(projectId: string) {
  const current = await getPinnedProjectId()
  if (current === projectId) {
    await db.syncMeta.delete(PINNED_PROJECT_KEY)
  } else {
    await db.syncMeta.put({ key: PINNED_PROJECT_KEY, value: projectId })
  }
}

export async function getProjects() {
  const archivedIds = new Set(await getArchivedProjectIds())
  const projects = await db.projects.orderBy('sortOrder').toArray()
  const active = projects.filter((project) => !archivedIds.has(project.id))
  return sortProjectsWithPin(active)
}

async function isVisibleProject(projectId: string) {
  const project = await db.projects.get(projectId)
  if (!project) return false

  const archived = await getArchivedProjectIds()
  return !archived.includes(projectId)
}

async function resolveActiveProjectId() {
  const meta = await db.syncMeta.get(ACTIVE_PROJECT_KEY)
  if (meta?.value && (await isVisibleProject(meta.value))) {
    return meta.value
  }

  const lastMeta = await db.syncMeta.get(LAST_ACTIVE_PROJECT_KEY)
  if (lastMeta?.value && (await isVisibleProject(lastMeta.value))) {
    return lastMeta.value
  }

  const projects = await getProjects()
  if (projects[0]) return projects[0].id

  const first = await db.projects.orderBy('sortOrder').first()
  if (first) return first.id

  const id = createId()
  await ensureDefaultProject(id)
  return id
}

export async function getActiveProjectId() {
  const resolved = await resolveActiveProjectId()
  const meta = await db.syncMeta.get(ACTIVE_PROJECT_KEY)
  if (meta?.value !== resolved) {
    await db.syncMeta.put({ key: ACTIVE_PROJECT_KEY, value: resolved })
  }
  return resolved
}

export async function setActiveProjectId(projectId: string) {
  await db.syncMeta.put({ key: ACTIVE_PROJECT_KEY, value: projectId })
  if (await isVisibleProject(projectId)) {
    await db.syncMeta.put({ key: LAST_ACTIVE_PROJECT_KEY, value: projectId })
  }
}

export async function getActiveTagFilter() {
  const meta = await db.syncMeta.get(ACTIVE_TAG_KEY)
  return meta?.value ?? null
}

export async function setActiveTagFilter(tag: string | null) {
  if (tag) {
    await db.syncMeta.put({ key: ACTIVE_TAG_KEY, value: tag })
  } else {
    await db.syncMeta.delete(ACTIVE_TAG_KEY)
  }
}

export async function getFavouritesOnlyFilter() {
  const meta = await db.syncMeta.get(FAVOURITES_ONLY_KEY)
  return meta?.value === 'true'
}

export async function getTitleSearchFilter() {
  const meta = await db.syncMeta.get(TITLE_SEARCH_KEY)
  return meta?.value?.trim() ?? ''
}

export async function clearAllBoardFilters() {
  await db.syncMeta.delete(ACTIVE_TAG_KEY)
  await db.syncMeta.delete(FAVOURITES_ONLY_KEY)
  await db.syncMeta.delete(TITLE_SEARCH_KEY)
}

export async function getSongSortMode(): Promise<SongSortMode> {
  const meta = await db.syncMeta.get(SONG_SORT_KEY)
  return meta?.value === 'recent' ? 'recent' : 'board'
}

export async function setSongSortMode(mode: SongSortMode) {
  await db.syncMeta.put({ key: SONG_SORT_KEY, value: mode })
}

export async function getLibraryTotals() {
  const projects = await getProjects()
  let songCount = 0
  let favouriteCount = 0

  for (const project of projects) {
    const songs = await db.songs
      .filter((song) => !song.deletedAt && song.projectId === project.id)
      .toArray()
    songCount += songs.length
    favouriteCount += songs.filter((song) => song.isFavourite).length
  }

  return { projectCount: projects.length, songCount, favouriteCount }
}

export async function hasActiveBoardFilters() {
  const [tag, favouritesOnly, titleSearch] = await Promise.all([
    getActiveTagFilter(),
    getFavouritesOnlyFilter(),
    getTitleSearchFilter(),
  ])
  return Boolean(tag || favouritesOnly || titleSearch)
}

export async function setTitleSearchFilter(query: string) {
  const trimmed = query.trim()
  if (trimmed) {
    await db.syncMeta.put({ key: TITLE_SEARCH_KEY, value: trimmed })
  } else {
    await db.syncMeta.delete(TITLE_SEARCH_KEY)
  }
}

export async function setFavouritesOnlyFilter(enabled: boolean) {
  if (enabled) {
    await db.syncMeta.put({ key: FAVOURITES_ONLY_KEY, value: 'true' })
  } else {
    await db.syncMeta.delete(FAVOURITES_ONLY_KEY)
  }
}

export async function ensureDefaultProject(id = createId()) {
  const count = await db.projects.count()
  if (count > 0) return (await db.projects.orderBy('sortOrder').first())!

  const project: Project = {
    id,
    name: DEFAULT_NAME,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  }
  await db.projects.add(project)
  await db.syncMeta.put({ key: ACTIVE_PROJECT_KEY, value: project.id })
  await enqueueSync('create', 'project', project.id, project)
  return project
}

export async function createProject(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Project name is required')

  const projects = await getProjects()
  const project: Project = {
    id: createId(),
    name: trimmed,
    sortOrder: projects.length,
    createdAt: new Date().toISOString(),
  }

  await db.projects.add(project)
  await setActiveProjectId(project.id)
  await enqueueSync('create', 'project', project.id, project)
  return project
}

export async function createProjectWithTemplate(
  name: string,
  templateId: import('@/lib/projectTemplates').ProjectTemplateId = 'blank',
) {
  const { getProjectTemplate } = await import('@/lib/projectTemplates')
  const template = getProjectTemplate(templateId)
  const project = await createProject(name)

  if (template.sections.length > 0) {
    const { ensureColumnsExist } = await import('./boardRepo')
    await ensureColumnsExist(template.sections)
  }

  return project
}

export async function renameProject(projectId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Project name is required')

  const now = new Date().toISOString()
  await db.projects.update(projectId, { name: trimmed })
  await enqueueSync('update', 'project', projectId, {
    id: projectId,
    name: trimmed,
    updatedAt: now,
  })

  const activeId = await getActiveProjectId()
  if (activeId === projectId) {
    await db.syncMeta.put({ key: PROJECT_NAME_KEY, value: trimmed })
    const projects = await getProjects()
    if (projects.length === 1) {
      const boardId = (await db.syncMeta.get('boardId'))?.value
      if (boardId) {
        await enqueueSync('update', 'board', boardId, { name: trimmed })
      }
    }
  }

  return trimmed
}

export async function moveProject(projectId: string, direction: 'up' | 'down') {
  const pinnedId = await getPinnedProjectId()
  const raw = await db.projects.orderBy('sortOrder').toArray()
  const display = await sortProjectsWithPin(raw)
  const index = display.findIndex((project) => project.id === projectId)
  if (index < 0) return
  if (pinnedId && projectId === pinnedId) return

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= display.length) return
  if (pinnedId && targetIndex === 0) return

  const reordered = [...display]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, moved)

  const unpinned = reordered.filter((project) => project.id !== pinnedId)
  const now = new Date().toISOString()
  for (let sortOrder = 0; sortOrder < unpinned.length; sortOrder++) {
    const project = unpinned[sortOrder]
    await db.projects.update(project.id, { sortOrder })
    await enqueueSync('update', 'project', project.id, {
      id: project.id,
      name: project.name,
      sortOrder,
      updatedAt: now,
    })
  }
}

export async function getProjectName() {
  const activeId = await getActiveProjectId()
  const project = await db.projects.get(activeId)
  if (project?.name) return project.name

  const meta = await db.syncMeta.get(PROJECT_NAME_KEY)
  return meta?.value ?? DEFAULT_NAME
}

export async function setProjectName(name: string) {
  const activeId = await getActiveProjectId()
  return renameProject(activeId, name)
}

export interface ProjectSummary {
  id: string
  name: string
  sortOrder: number
  songCount: number
  favouriteCount: number
  lastUpdated: string | null
  isPinned: boolean
  isArchived: boolean
  accentHue: number | null
}

async function buildProjectSummary(
  project: Project,
  pinnedId: string | null,
  isArchived: boolean,
  accentMap: Record<string, number>,
): Promise<ProjectSummary> {
  const songs = await db.songs
    .filter((song) => !song.deletedAt && song.projectId === project.id)
    .toArray()

  let lastUpdated: string | null = null
  for (const song of songs) {
    if (!lastUpdated || song.updatedAt > lastUpdated) lastUpdated = song.updatedAt
  }

  return {
    id: project.id,
    name: project.name,
    sortOrder: project.sortOrder,
    songCount: songs.length,
    favouriteCount: songs.filter((song) => song.isFavourite).length,
    lastUpdated,
    isPinned: project.id === pinnedId,
    isArchived,
    accentHue: accentMap[project.id] ?? null,
  }
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await getProjects()
  const pinnedId = await getPinnedProjectId()
  const accentMap = await getProjectAccentMap()
  const summaries: ProjectSummary[] = []

  for (const project of projects) {
    summaries.push(await buildProjectSummary(project, pinnedId, false, accentMap))
  }

  return summaries
}

export async function getArchivedProjectSummaries(): Promise<ProjectSummary[]> {
  const archivedIds = await getArchivedProjectIds()
  if (!archivedIds.length) return []

  const archivedSet = new Set(archivedIds)
  const projects = await db.projects.orderBy('sortOrder').toArray()
  const pinnedId = await getPinnedProjectId()
  const accentMap = await getProjectAccentMap()
  const summaries: ProjectSummary[] = []

  for (const project of projects) {
    if (!archivedSet.has(project.id)) continue
    summaries.push(await buildProjectSummary(project, pinnedId, true, accentMap))
  }

  return summaries
}

export async function archiveProject(projectId: string) {
  const activeProjects = await getProjects()
  if (activeProjects.length <= 1 && activeProjects.some((project) => project.id === projectId)) {
    throw new Error('Keep at least one active project')
  }

  const archived = await getArchivedProjectIds()
  if (archived.includes(projectId)) return

  await setArchivedProjectIds([...archived, projectId])

  const pinnedId = await getPinnedProjectId()
  if (pinnedId === projectId) {
    await db.syncMeta.delete(PINNED_PROJECT_KEY)
  }

  const activeId = await getActiveProjectId()
  if (activeId === projectId) {
    const next = activeProjects.find((project) => project.id !== projectId)
    if (next) await setActiveProjectId(next.id)
  }
}

export async function unarchiveProject(projectId: string) {
  const archived = await getArchivedProjectIds()
  await setArchivedProjectIds(archived.filter((id) => id !== projectId))
}

export async function restoreAndOpenProject(projectId: string) {
  await unarchiveProject(projectId)
  await setActiveProjectId(projectId)
}

export async function getEmptyProjectIds() {
  const projects = await getProjects()
  const emptyIds: string[] = []

  for (const project of projects) {
    const songCount = await db.songs
      .filter((song) => !song.deletedAt && song.projectId === project.id)
      .count()
    if (songCount === 0) emptyIds.push(project.id)
  }

  return emptyIds
}

export async function getArchivedEmptyProjectIds() {
  const summaries = await getArchivedProjectSummaries()
  return summaries.filter((summary) => summary.songCount === 0).map((summary) => summary.id)
}

export async function deleteArchivedEmptyProjects() {
  const emptyIds = await getArchivedEmptyProjectIds()
  let deleted = 0

  for (const projectId of emptyIds) {
    try {
      await deleteProject(projectId)
      deleted++
    } catch {
      break
    }
  }

  return deleted
}

export async function archiveEmptyProjects() {
  const emptyIds = await getEmptyProjectIds()
  let archived = 0

  for (const projectId of emptyIds) {
    try {
      await archiveProject(projectId)
      archived++
    } catch {
      break
    }
  }

  return archived
}

export type DuplicateProjectResult = {
  project: Project
  songsCopied: number
  clipsCopied: number
  clipsSkipped: number
}

export async function duplicateProject(sourceProjectId: string) {
  const source = await db.projects.get(sourceProjectId)
  if (!source) throw new Error('Project not found')

  const projects = await getProjects()
  const project: Project = {
    id: createId(),
    name: `${source.name} (copy)`,
    sortOrder: projects.length,
    createdAt: new Date().toISOString(),
  }

  await db.projects.add(project)
  await enqueueSync('create', 'project', project.id, project)

  const songs = await db.songs
    .filter((song) => !song.deletedAt && song.projectId === sourceProjectId)
    .toArray()
  songs.sort((a, b) => a.columnSlug.localeCompare(b.columnSlug) || a.sortOrder - b.sortOrder)

  const { duplicateSong } = await import('./audioRepo')
  const { updateSong } = await import('./boardRepo')

  let clipsCopied = 0
  let clipsSkipped = 0

  for (const song of songs) {
    const result = await duplicateSong(song.id, {
      projectId: project.id,
      title: song.title,
    })
    if (song.isFavourite) {
      await updateSong(result.song.id, { isFavourite: true })
    }
    clipsCopied += result.clipsCopied
    clipsSkipped += result.clipsSkipped
  }

  await setActiveProjectId(project.id)

  return {
    project,
    songsCopied: songs.length,
    clipsCopied,
    clipsSkipped,
  } satisfies DuplicateProjectResult
}

export async function deleteProject(projectId: string) {
  const allProjects = await db.projects.toArray()
  if (allProjects.length <= 1) throw new Error('Keep at least one project')

  const projects = await getProjects()

  const songs = await db.songs
    .filter((song) => !song.deletedAt && song.projectId === projectId)
    .toArray()

  if (songs.length > 0) {
    const { deleteSong } = await import('./boardRepo')
    for (const song of songs) {
      await deleteSong(song.id)
    }
  }

  const archived = await getArchivedProjectIds()
  if (archived.includes(projectId)) {
    await setArchivedProjectIds(archived.filter((id) => id !== projectId))
  }

  const accentMap = await getProjectAccentMap()
  if (accentMap[projectId] !== undefined) {
    delete accentMap[projectId]
    if (Object.keys(accentMap).length === 0) {
      await db.syncMeta.delete(PROJECT_ACCENTS_KEY)
    } else {
      await db.syncMeta.put({ key: PROJECT_ACCENTS_KEY, value: JSON.stringify(accentMap) })
    }
  }

  await enqueueSync('delete', 'project', projectId, { id: projectId })
  await db.projects.delete(projectId)

  const activeId = await getActiveProjectId()
  if (activeId === projectId) {
    const fallback = projects.find((project) => project.id !== projectId)
    if (fallback) await setActiveProjectId(fallback.id)
  }
}

export type LibrarySongMatch = {
  songId: string
  title: string
  projectId: string
  projectName: string
  columnSlug: string
}

export async function searchLibrary(query: string) {
  const trimmed = query.trim().toLowerCase()
  const summaries = await getProjectSummaries()

  if (!trimmed) {
    return { summaries, songs: [] as LibrarySongMatch[] }
  }

  const projects = await getProjects()
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
  const matchingProjectIds = new Set<string>()
  const songs: LibrarySongMatch[] = []
  const archivedIds = new Set(await getArchivedProjectIds())
  const allSongs = await db.songs.filter((song) => !song.deletedAt).toArray()

  for (const song of allSongs) {
    if (song.projectId && archivedIds.has(song.projectId)) continue

    const haystack = [song.title, song.notes, ...(song.tags ?? [])].join(' ').toLowerCase()
    if (!haystack.includes(trimmed)) continue

    if (song.projectId) matchingProjectIds.add(song.projectId)
    songs.push({
      songId: song.id,
      title: song.title,
      projectId: song.projectId ?? '',
      projectName: song.projectId ? (projectNameById.get(song.projectId) ?? 'Project') : 'Inbox',
      columnSlug: song.columnSlug,
    })
  }

  const filteredSummaries = summaries.filter(
    (summary) =>
      summary.name.toLowerCase().includes(trimmed) || matchingProjectIds.has(summary.id),
  )

  return { summaries: filteredSummaries, songs: songs.slice(0, 24) }
}

export async function getAllTags() {
  const songs = await db.songs.filter((s) => !s.deletedAt).toArray()
  const tags = new Set<string>()
  for (const song of songs) {
    for (const tag of song.tags ?? []) tags.add(tag)
  }
  return [...tags].sort((a, b) => a.localeCompare(b))
}
