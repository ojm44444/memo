import { useLiveQuery } from 'dexie-react-hooks'
import { getProjects } from '@/db/repositories/projectRepo'
import { moveSongToProject } from '@/db/repositories/boardRepo'

interface SongProjectSelectProps {
  songId: string
  projectId: string
  readOnly?: boolean
}

export function SongProjectSelect({ songId, projectId, readOnly = false }: SongProjectSelectProps) {
  const projects = useLiveQuery(() => getProjects(), [])

  if ((projects?.length ?? 0) <= 1) return null

  const current = projects?.find((project) => project.id === projectId)

  if (readOnly) {
    return <span className="song-project-readonly">{current?.name ?? 'Project'}</span>
  }

  return (
    <label className="song-project-select">
      <span className="song-project-label">Project</span>
      <select
        className="song-project-input"
        value={projectId}
        onChange={(e) => void moveSongToProject(songId, e.target.value)}
      >
        {projects?.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  )
}
