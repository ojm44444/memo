import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { projectAccentStyle } from '@/lib/projectAccent'

export function BoardProjectAccent() {
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )

  if (!activeProjectId) return null

  return (
    <span
      className="board-titlebar-accent"
      style={projectAccentStyle(activeProjectId, accentHue ?? null)}
      aria-hidden
    />
  )
}
