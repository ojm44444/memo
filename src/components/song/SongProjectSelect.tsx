import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProjects, createProject } from '@/db/repositories/projectRepo'
import { moveSongToProject } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { CustomSelect } from '@/components/ui/CustomSelect'

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

  const options = (projects ?? []).map((p) => ({ value: p.id, label: p.name }))
  // A song in no project (or one whose project was removed) used to show an
  // empty pill, which is why changing project looked impossible: there was
  // nothing to see or click. Name the state instead.
  if (!current) options.unshift({ value: projectId, label: 'No project' })
  // Until projects load, hold the pill's place with no text rather than
  // rendering nothing: the raw id must never show, and the panel must not
  // jump when the picker arrives a moment after the song.
  if (!projects) {
    return (
      <div className="song-project-select" aria-busy="true">
        <span className="song-project-label">Project</span>
        <div className="song-project-row">
          <div className="custom-select song-project-custom-select">
            <span className="custom-select-trigger" aria-hidden="true">
              <span className="custom-select-value">&nbsp;</span>
            </span>
          </div>
        </div>
      </div>
    )
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
          <CustomSelect
            value={projectId}
            options={options}
            onChange={(id) => {
              if (!id || id === projectId) return
              void moveSongToProject(songId, id).then(() => scheduleFlush())
            }}
            className="song-project-custom-select"
            popoverClassName="sp-select-popover"
          />
          <button
            type="button"
            className="song-project-new-btn"
            onClick={() => setCreating(true)}
            title="Make a new project and move this song into it"
          >
            + New project
          </button>
        </div>
      )}
    </div>
  )
}
