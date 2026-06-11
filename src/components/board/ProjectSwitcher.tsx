import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createProject,
  getActiveProjectId,
  getProjectAccentMap,
  getProjects,
  getProjectName,
  setActiveProjectId,
  setProjectName,
} from '@/db/repositories/projectRepo'
import { projectAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { scheduleFlush } from '@/sync/syncEngine'

interface ProjectSwitcherProps {
  readOnly?: boolean
}

export function ProjectSwitcher({ readOnly = false }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const projects = useLiveQuery(() => getProjects(), [])
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const name = useLiveQuery(() => getProjectName(), [activeProjectId])
  const accentMap = useLiveQuery(() => getProjectAccentMap(), [])

  const switchProject = async (projectId: string) => {
    await setActiveProjectId(projectId)
    setOpen(false)
  }

  const addProject = async () => {
    if (!newName.trim()) return
    await createProject(newName)
    setNewName('')
    setAdding(false)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof HTMLInputElement && target.classList.contains('project-switcher-input')) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (adding) {
        setAdding(false)
        return
      }
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, adding])

  if (readOnly) {
    return <span className="board-titlebar-project">{name ?? 'My Project'}</span>
  }

  return (
    <div className="project-switcher">
      <button
        type="button"
        className="project-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {activeProjectId && (
          <span
            className="project-switcher-accent"
            style={projectAccentStyle(activeProjectId, accentMap?.[activeProjectId] ?? null)}
            aria-hidden
          />
        )}
        <span
          className="project-switcher-label"
          style={
            activeProjectId
              ? projectAccentTextStyle(activeProjectId, accentMap?.[activeProjectId] ?? null)
              : undefined
          }
        >
          {name ?? 'My Project'}
        </span>
        <span className="project-switcher-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="project-switcher-panel" role="listbox">
          {projects?.map((project) => (
            <button
              key={project.id}
              type="button"
              role="option"
              aria-selected={project.id === activeProjectId}
              className={
                project.id === activeProjectId
                  ? 'project-switcher-item is-active'
                  : 'project-switcher-item'
              }
              onClick={() => void switchProject(project.id)}
            >
              <span
                className="project-switcher-item-accent"
                style={projectAccentStyle(project.id, accentMap?.[project.id] ?? null)}
                aria-hidden
              />
              <span
                className="project-switcher-item-name"
                style={
                  project.id === activeProjectId
                    ? projectAccentTextStyle(project.id, accentMap?.[project.id] ?? null)
                    : undefined
                }
              >
                {project.name}
              </span>
            </button>
          ))}

          {!adding ? (
            <button
              type="button"
              className="project-switcher-add"
              onClick={() => setAdding(true)}
            >
              + New project
            </button>
          ) : (
            <div className="project-switcher-inline-form">
              <input
                className="project-switcher-input"
                placeholder="Project name"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addProject()
                  if (e.key === 'Escape') setAdding(false)
                }}
              />
              <button type="button" className="project-switcher-save" onClick={() => void addProject()}>
                Add
              </button>
            </div>
          )}

          <label className="project-switcher-rename">
            <span className="project-switcher-rename-label">Rename active</span>
            <input
              key={activeProjectId}
              defaultValue={name ?? 'My Project'}
              onBlur={(e) => {
                void setProjectName(e.target.value).then(() => scheduleFlush())
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur()
                  setOpen(false)
                }
              }}
              className="project-switcher-rename-input"
            />
          </label>
        </div>
      )}
    </div>
  )
}
