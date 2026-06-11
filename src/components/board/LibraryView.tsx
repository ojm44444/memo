import { useLiveQuery } from 'dexie-react-hooks'
import {
  archiveEmptyProjects,
  archiveProject,
  createProjectWithTemplate,
  getEmptyProjectIds,
  deleteArchivedEmptyProjects,
  deleteProject,
  duplicateProject,
  getArchivedProjectSummaries,
  moveProject,
  renameProject,
  setProjectAccentHue,
  toggleProjectPin,
  restoreAndOpenProject,
  getActiveProjectId,
  getProjectAccentHue,
  getLibraryTotals,
  getProjects,
  searchLibrary,
  setActiveProjectId,
} from '@/db/repositories/projectRepo'
import {
  PROJECT_ACCENT_PRESETS,
  libraryCardAccentStyle,
  libraryViewAccentStyle,
  projectAccentStyle,
  projectAccentSwatchStyle,
  projectAccentTextStyle,
} from '@/lib/projectAccent'
import {
  getProjectTemplate,
  PROJECT_TEMPLATES,
  type ProjectTemplateId,
} from '@/lib/projectTemplates'
import { useUiStore } from '@/stores/uiStore'
import { useCallback, useState } from 'react'
import { LibrarySearch } from './LibrarySearch'
import { RecentSongsRow } from './RecentSongsRow'

function formatRelativeTime(iso: string | null) {
  if (!iso) return 'No songs yet'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 7) return `Updated ${days}d ago`
  return `Updated ${new Date(iso).toLocaleDateString()}`
}

interface LibraryViewProps {
  readOnly?: boolean
}

export function LibraryView({ readOnly = false }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const handleSearchChange = useCallback((value: string) => setSearchQuery(value), [])
  const libraryResults = useLiveQuery(() => searchLibrary(searchQuery), [searchQuery])
  const summaries = libraryResults?.summaries
  const matchingSongs = libraryResults?.songs ?? []
  const projectCount = useLiveQuery(() => getProjects().then((projects) => projects.length), [])
  const totals = useLiveQuery(() => getLibraryTotals(), [])
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )
  const headerAccentStyle = activeProjectId
    ? libraryViewAccentStyle(activeProjectId, accentHue ?? null)
    : undefined
  const titleAccentStyle = activeProjectId
    ? projectAccentTextStyle(activeProjectId, accentHue ?? null)
    : undefined
  const setBoardMode = useUiStore((s) => s.setBoardMode)
  const openDrawer = useUiStore((s) => s.openDrawer)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<ProjectTemplateId>('blank')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [colourProjectId, setColourProjectId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const archivedSummaries = useLiveQuery(
    () => (showArchived ? getArchivedProjectSummaries() : Promise.resolve([])),
    [showArchived],
  )
  const archivedCount = useLiveQuery(() => getArchivedProjectSummaries().then((rows) => rows.length), [])
  const emptyProjectCount = useLiveQuery(() => getEmptyProjectIds().then((ids) => ids.length), [])

  const openProject = async (projectId: string) => {
    await setActiveProjectId(projectId)
    setBoardMode('manage')
  }

  const addProject = async () => {
    if (!name.trim()) return
    await createProjectWithTemplate(name, templateId)
    setName('')
    setTemplateId('blank')
    setAdding(false)
    setBoardMode('manage')
  }

  const cancelAddProject = () => {
    setName('')
    setTemplateId('blank')
    setAdding(false)
  }

  const selectedTemplate = getProjectTemplate(templateId)

  const copyProject = async (projectId: string, projectName: string, songCount: number) => {
    if (
      songCount > 0 &&
      !confirm(`Duplicate "${projectName}" with ${songCount} ${songCount === 1 ? 'song' : 'songs'}?`)
    ) {
      return
    }

    setDuplicatingId(projectId)
    try {
      const result = await duplicateProject(projectId)
      if (result.clipsSkipped > 0) {
        alert(
          `Created "${result.project.name}" with ${result.songsCopied} songs. ${result.clipsSkipped} cloud-only clips were skipped — download them first from Settings.`,
        )
      }
      setBoardMode('manage')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not duplicate project')
    } finally {
      setDuplicatingId(null)
    }
  }

  const stashProject = async (projectId: string, projectName: string, songCount: number) => {
    const detail =
      songCount > 0
        ? `Archive "${projectName}"? Its ${songCount} ${songCount === 1 ? 'song' : 'songs'} stay saved — you can restore later.`
        : `Archive "${projectName}"? You can restore it later.`
    if (!confirm(detail)) return
    try {
      await archiveProject(projectId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not archive project')
    }
  }

  const archivedEmptyCount =
    archivedSummaries?.filter((project) => project.songCount === 0).length ?? 0

  const deleteArchivedEmpty = async () => {
    if (archivedEmptyCount === 0) return
    if (
      !confirm(
        `Permanently delete ${archivedEmptyCount} archived empty ${
          archivedEmptyCount === 1 ? 'project' : 'projects'
        }? This cannot be undone.`,
      )
    ) {
      return
    }
    try {
      const deleted = await deleteArchivedEmptyProjects()
      if (deleted === 0) alert('Could not delete archived projects')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete archived projects')
    }
  }

  const archiveAllEmpty = async () => {
    const count = emptyProjectCount ?? 0
    if (count === 0) return
    if (!confirm(`Archive ${count} empty ${count === 1 ? 'project' : 'projects'}?`)) return
    try {
      const archived = await archiveEmptyProjects()
      if (archived === 0) {
        alert('Keep at least one active project')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not archive empty projects')
    }
  }

  const pickProjectColour = async (projectId: string, hue: number | null) => {
    await setProjectAccentHue(projectId, hue)
    setColourProjectId(null)
  }

  const restoreProject = async (projectId: string) => {
    await restoreAndOpenProject(projectId)
    setShowArchived(false)
    setBoardMode('manage')
  }

  const removeProject = async (projectId: string, projectName: string, songCount: number) => {
    const detail =
      songCount > 0
        ? `Delete "${projectName}" and its ${songCount} ${songCount === 1 ? 'song' : 'songs'}?`
        : `Delete "${projectName}"?`
    if (!confirm(`${detail} This cannot be undone.`)) return
    try {
      await deleteProject(projectId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete project')
    }
  }

  const statsLine = totals
    ? `${totals.projectCount} projects · ${totals.songCount} songs${
        totals.favouriteCount > 0 ? ` · ★ ${totals.favouriteCount}` : ''
      }`
    : `${summaries?.length ?? 0} projects`

  return (
    <div className="library-view">
      <div
        className={activeProjectId ? 'library-view-header has-project-accent' : 'library-view-header'}
        style={headerAccentStyle}
      >
        <div>
          <h2 className="library-view-title" style={titleAccentStyle}>
            Library
          </h2>
          <p className="library-view-sub">{statsLine}</p>
        </div>
        {!readOnly &&
          (!adding ? (
            <button type="button" className="library-view-new" onClick={() => setAdding(true)}>
              + New project
            </button>
          ) : (
            <div className="library-view-create-form">
              <input
                className="library-view-input"
                placeholder="Project name"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addProject()
                  if (e.key === 'Escape') cancelAddProject()
                }}
              />
              <div className="library-view-template-picker" role="radiogroup" aria-label="Section layout">
                {PROJECT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={templateId === template.id}
                    className={
                      templateId === template.id
                        ? 'library-view-template is-active'
                        : 'library-view-template'
                    }
                    onClick={() => setTemplateId(template.id)}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              <p className="library-view-template-hint">{selectedTemplate.description}</p>
              <div className="library-view-create-actions">
                <button type="button" className="library-view-save" onClick={() => void addProject()}>
                  Add
                </button>
                <button type="button" className="library-view-cancel" onClick={cancelAddProject}>
                  Cancel
                </button>
              </div>
            </div>
          ))}
      </div>

      <div className="library-view-toolbar">
        <LibrarySearch value={searchQuery} onChange={handleSearchChange} />
        {!readOnly && (
          <div className="library-view-toolbar-actions">
            {(emptyProjectCount ?? 0) > 0 && !searchQuery && (
              <button
                type="button"
                className="library-view-archive-empty"
                onClick={() => void archiveAllEmpty()}
              >
                Archive empty ({emptyProjectCount})
              </button>
            )}
            {(archivedCount ?? 0) > 0 && (
              <button
                type="button"
                className={
                  showArchived ? 'library-view-archived-toggle is-active' : 'library-view-archived-toggle'
                }
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived ? 'Hide archived' : `Archived (${archivedCount})`}
              </button>
            )}
          </div>
        )}
      </div>

      {!searchQuery && <RecentSongsRow scope="library" />}

      {searchQuery && matchingSongs.length > 0 && (
        <section className="library-song-matches" aria-label="Matching songs">
          <h3 className="library-song-matches-title">Songs</h3>
          <ul className="library-song-matches-list">
            {matchingSongs.map((match) => (
              <li key={match.songId}>
                <button
                  type="button"
                  className="library-song-match"
                  onClick={() => {
                    void (async () => {
                      await setActiveProjectId(match.projectId)
                      setBoardMode('manage')
                      openDrawer(match.songId)
                    })()
                  }}
                >
                  <span className="library-song-match-title">{match.title}</span>
                  <span className="library-song-match-meta">
                    {match.projectName} · {match.columnSlug}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {searchQuery && summaries?.length === 0 && matchingSongs.length === 0 && (
        <p className="library-search-empty">No projects or songs match “{searchQuery}”.</p>
      )}

      <div className="library-grid">
        {summaries?.map((project, index) => (
          <div
            key={project.id}
            className={
              project.id === activeProjectId
                ? 'library-card-wrap is-active'
                : project.isPinned
                  ? 'library-card-wrap is-pinned'
                  : 'library-card-wrap'
            }
          >
            <button
              type="button"
              className="library-card has-project-accent"
              style={libraryCardAccentStyle(project.id, project.accentHue)}
              onClick={() => {
                if (renamingId === project.id) return
                void openProject(project.id)
              }}
            >
              <div
                className="library-card-art"
                style={projectAccentStyle(project.id, project.accentHue)}
              />
              <div className="library-card-body">
                {renamingId === project.id ? (
                  <input
                    className="library-card-rename"
                    value={renameDraft}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => {
                      void renameProject(project.id, renameDraft).finally(() => setRenamingId(null))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void renameProject(project.id, renameDraft).finally(() => setRenamingId(null))
                      }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                  />
                ) : (
                  <span className="library-card-name">
                    {project.isPinned && <span className="library-card-pin">📌 </span>}
                    {project.name}
                  </span>
                )}
                <span className="library-card-meta">
                  {project.songCount} {project.songCount === 1 ? 'song' : 'songs'}
                  {project.favouriteCount > 0 && ` · ★ ${project.favouriteCount}`}
                </span>
                <span className="library-card-time">{formatRelativeTime(project.lastUpdated)}</span>
              </div>
            </button>
            {!readOnly && colourProjectId === project.id && (
              <div className="library-card-colours" role="group" aria-label={`Colour for ${project.name}`}>
                <button
                  type="button"
                  className={
                    project.accentHue === null
                      ? 'library-card-colour is-active'
                      : 'library-card-colour is-auto'
                  }
                  aria-label="Auto colour"
                  onClick={() => void pickProjectColour(project.id, null)}
                >
                  Auto
                </button>
                {PROJECT_ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.hue}
                    type="button"
                    className={
                      project.accentHue === preset.hue
                        ? 'library-card-colour is-active'
                        : 'library-card-colour'
                    }
                    style={projectAccentSwatchStyle(preset.hue)}
                    aria-label={`${preset.label} colour`}
                    title={preset.label}
                    onClick={() => void pickProjectColour(project.id, preset.hue)}
                  />
                ))}
              </div>
            )}
            {!readOnly && (
              <div className="library-card-actions">
                {!searchQuery && (
                  <button
                    type="button"
                    className={
                      colourProjectId === project.id
                        ? 'library-card-action is-active'
                        : 'library-card-action'
                    }
                    aria-label={`Pick colour for ${project.name}`}
                    onClick={() =>
                      setColourProjectId((current) => (current === project.id ? null : project.id))
                    }
                  >
                    ◐
                  </button>
                )}
                {!searchQuery && (
                  <button
                    type="button"
                    className={
                      project.isPinned
                        ? 'library-card-action is-pinned'
                        : 'library-card-action'
                    }
                    aria-label={project.isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
                    onClick={() => void toggleProjectPin(project.id)}
                  >
                    {project.isPinned ? '📌' : '○'}
                  </button>
                )}
                {!searchQuery && (summaries?.length ?? 0) > 1 && (
                  <div className="library-card-reorder">
                    <button
                      type="button"
                      className="library-card-action"
                      disabled={index <= (summaries?.some((entry) => entry.isPinned) ? 1 : 0)}
                      aria-label={`Move ${project.name} up`}
                      onClick={() => void moveProject(project.id, 'up')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="library-card-action"
                      disabled={index >= (summaries?.length ?? 0) - 1}
                      aria-label={`Move ${project.name} down`}
                      onClick={() => void moveProject(project.id, 'down')}
                    >
                      ↓
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="library-card-action"
                  aria-label={`Duplicate ${project.name}`}
                  disabled={duplicatingId === project.id}
                  onClick={() => void copyProject(project.id, project.name, project.songCount)}
                >
                  {duplicatingId === project.id ? '…' : '⧉'}
                </button>
                <button
                  type="button"
                  className="library-card-action"
                  aria-label={`Rename ${project.name}`}
                  onClick={() => {
                    setRenamingId(project.id)
                    setRenameDraft(project.name)
                  }}
                >
                  ✎
                </button>
                {(projectCount ?? 0) > 1 && (
                  <button
                    type="button"
                    className="library-card-action"
                    aria-label={`Archive ${project.name}`}
                    onClick={() => void stashProject(project.id, project.name, project.songCount)}
                  >
                    ⊟
                  </button>
                )}
                <button
                  type="button"
                  className="library-card-delete"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => void removeProject(project.id, project.name, project.songCount)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showArchived && (archivedSummaries?.length ?? 0) > 0 && (
        <section className="library-archived" aria-label="Archived projects">
          <div className="library-archived-header">
            <h3 className="library-archived-title">Archived</h3>
            {!readOnly && archivedEmptyCount > 0 && (
              <button
                type="button"
                className="library-archived-delete-empty"
                onClick={() => void deleteArchivedEmpty()}
              >
                Delete empty ({archivedEmptyCount})
              </button>
            )}
          </div>
          <div className="library-grid">
            {archivedSummaries?.map((project) => (
              <div key={project.id} className="library-card-wrap is-archived">
                <button
                  type="button"
                  className="library-card has-project-accent"
                  style={libraryCardAccentStyle(project.id, project.accentHue)}
                  onClick={() => void restoreProject(project.id)}
                >
                  <div
                    className="library-card-art"
                    style={projectAccentStyle(project.id, project.accentHue)}
                  />
                  <div className="library-card-body">
                    <span className="library-card-name">{project.name}</span>
                    <span className="library-card-meta">
                      {project.songCount} {project.songCount === 1 ? 'song' : 'songs'}
                    </span>
                    <span className="library-card-time">{formatRelativeTime(project.lastUpdated)}</span>
                  </div>
                </button>
                {!readOnly && (
                  <div className="library-card-actions">
                    <button
                      type="button"
                      className="library-card-action"
                      aria-label={`Restore and open ${project.name}`}
                      onClick={() => void restoreProject(project.id)}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="library-card-delete"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => void removeProject(project.id, project.name, project.songCount)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
