import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProjects, createProject } from '@/db/repositories/projectRepo'
import { moveSongToProject } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface SongProjectSelectProps {
  songId: string
  projectId: string
  readOnly?: boolean
}

export function SongProjectSelect({ songId, projectId, readOnly = false }: SongProjectSelectProps) {
  const projects = useLiveQuery(() => getProjects(), [])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const current = projects?.find((p) => p.id === projectId)

  if (readOnly) {
    return <span className="song-project-readonly">{current?.name ?? 'Project'}</span>
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const project = await createProject(name)
    await moveSongToProject(songId, project.id)
    scheduleFlush()
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="song-project-select">
      <span className="song-project-label">Project</span>
      {creating ? (
        <div className="song-project-create-row">
          <input
            className="song-project-create-input"
            placeholder="Project name…"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
          />
          <button type="button" className="song-project-create-confirm" onClick={() => void handleCreate()}>
            Create
          </button>
          <button type="button" className="song-project-create-cancel" onClick={() => { setCreating(false); setNewName('') }}>
            ✕
          </button>
        </div>
      ) : (
        <div className="song-project-row">
          <select
            className="song-project-input"
            value={projectId}
            onChange={(e) => void moveSongToProject(songId, e.target.value)}
          >
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="song-project-new-btn"
            onClick={() => setCreating(true)}
            title="New project"
          >
            + New
          </button>
        </div>
      )}
    </div>
  )
}
