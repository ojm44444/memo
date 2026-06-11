import { useLiveQuery } from 'dexie-react-hooks'
import { getProjectName, setProjectName } from '@/db/repositories/projectRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface ProjectTitleProps {
  readOnly?: boolean
}

export function ProjectTitle({ readOnly = false }: ProjectTitleProps) {
  const name = useLiveQuery(() => getProjectName())

  if (readOnly) {
    return <span className="board-titlebar-project">{name ?? 'My Project'}</span>
  }

  return (
    <input
      key={name}
      defaultValue={name ?? 'My Project'}
      onBlur={(e) => {
        void setProjectName(e.target.value).then(() => scheduleFlush())
      }}
      className="board-titlebar-project max-w-[180px] border-none bg-transparent text-right outline-none focus:text-audio-mint"
      aria-label="Project name"
    />
  )
}
