import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTagGradient } from '@/lib/tagColors'
import {
  createProject,
  getActiveProjectId,
  getActiveTagFilter,
  getAllTags,
  getFavouritesOnlyFilter,
  getProjects,
  setActiveProjectId,
  setActiveTagFilter,
  setFavouritesOnlyFilter,
  clearAllBoardFilters,
  getSongSortMode,
  getTitleSearchFilter,
  setSongSortMode,
  type SongSortMode,
} from '@/db/repositories/projectRepo'

interface BoardFiltersProps {
  readOnly?: boolean
}

export function BoardFilters({ readOnly = false }: BoardFiltersProps) {
  const [open, setOpen] = useState(false)
  const projects = useLiveQuery(() => getProjects(), [])
  const tags = useLiveQuery(() => getAllTags(), [])
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const activeTag = useLiveQuery(() => getActiveTagFilter(), [])
  const favouritesOnly = useLiveQuery(() => getFavouritesOnlyFilter(), [])
  const titleSearch = useLiveQuery(() => getTitleSearchFilter(), [])
  const songSort = useLiveQuery(() => getSongSortMode(), [])
  const [addingProject, setAddingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const hasFilters =
    Boolean(titleSearch) ||
    (projects?.length ?? 0) > 1 ||
    (tags?.length ?? 0) > 0 ||
    activeTag ||
    favouritesOnly

  const addProject = async () => {
    if (!projectName.trim()) return
    await createProject(projectName)
    setProjectName('')
    setAddingProject(false)
  }

  return (
    <div className="board-filter-menu">
      <button
        type="button"
        className={hasFilters ? 'board-filter-trigger is-active' : 'board-filter-trigger'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Filter
      </button>

      {open && (
        <div className="board-filter-panel">
          {(projects?.length ?? 0) > 1 && (
            <label className="board-filter-group">
              <span className="board-filter-label">Project</span>
              <select
                className="board-filter-select"
                value={activeProjectId ?? ''}
                onChange={(e) => void setActiveProjectId(e.target.value)}
              >
                {projects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!readOnly && !addingProject ? (
            <button type="button" className="board-filter-add" onClick={() => setAddingProject(true)}>
              + Project
            </button>
          ) : !readOnly ? (
            <div className="board-filter-inline-form">
              <input
                className="board-filter-input"
                placeholder="Project name"
                value={projectName}
                autoFocus
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addProject()
                  if (e.key === 'Escape') setAddingProject(false)
                }}
              />
              <button type="button" className="board-filter-save" onClick={() => void addProject()}>
                Add
              </button>
            </div>
          ) : null}

          <label className="board-filter-group">
            <span className="board-filter-label">Sort</span>
            <select
              className="board-filter-select"
              value={songSort ?? 'board'}
              onChange={(e) => void setSongSortMode(e.target.value as SongSortMode)}
            >
              <option value="board">Board order</option>
              <option value="recent">Recently updated</option>
            </select>
          </label>

          <div className="board-filter-tags">
            <button
              type="button"
              className={favouritesOnly ? 'board-tag-chip is-active' : 'board-tag-chip'}
              onClick={() => void setFavouritesOnlyFilter(!favouritesOnly)}
            >
              ★ Favourites
            </button>
          </div>

          {(tags?.length ?? 0) > 0 && (
            <div className="board-filter-tags">
              <button
                type="button"
                className={!activeTag ? 'board-tag-chip is-active' : 'board-tag-chip'}
                onClick={() => void setActiveTagFilter(null)}
              >
                All tags
              </button>
              {tags?.map((tag) => {
                const gradient = getTagGradient(tag)
                const isActive = activeTag === tag
                return (
                  <button
                    key={tag}
                    type="button"
                    className={isActive ? 'board-tag-chip is-active' : 'board-tag-chip'}
                    style={
                      isActive
                        ? ({ background: gradient, '--tag-gradient': gradient } as React.CSSProperties)
                        : ({ '--tag-gradient': gradient } as React.CSSProperties)
                    }
                    onClick={() => void setActiveTagFilter(tag)}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          )}

          {hasFilters && (
            <button
              type="button"
              className="board-filter-clear"
              onClick={() => void clearAllBoardFilters()}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
