import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { boardFrameAccentStyle } from '@/lib/projectAccent'

export function BoardFrame({ children }: { children: ReactNode }) {
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )

  if (!activeProjectId) {
    return <div className="board-frame">{children}</div>
  }

  return (
    <div
      className="board-frame has-project-accent"
      style={boardFrameAccentStyle(activeProjectId, accentHue ?? null)}
    >
      {children}
    </div>
  )
}
