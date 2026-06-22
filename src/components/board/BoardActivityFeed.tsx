import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBoardActivity } from '@/db/repositories/activityRepo'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { useUiStore } from '@/stores/uiStore'

export function BoardActivityFeed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('activity-collapsed') !== 'false' } catch { return true }
  })

  useEffect(() => {
    try { localStorage.setItem('activity-collapsed', String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])
  const activity = useLiveQuery(() => getBoardActivity(10), [])
  const openDrawer = useUiStore((state) => state.openDrawer)

  if (!activity?.length) return null

  return (
    <section className="board-activity" aria-label="Recent activity">
      <button
        type="button"
        className="board-activity-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <h3 className="board-activity-title">Activity</h3>
        <span className="board-activity-hint">Edits and comments on this project</span>
        <span className="board-activity-toggle" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <ul className="board-activity-list">
          {activity.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="board-activity-item"
                onClick={() => openDrawer(item.songId)}
              >
                <span className={`board-activity-icon is-${item.type}`} aria-hidden="true">
                  {item.type === 'comment' ? '💬' : '✎'}
                </span>
                <span className="board-activity-copy">
                  <span className="board-activity-song">{item.title}</span>
                  <span className="board-activity-detail">{item.subtitle}</span>
                </span>
                <span className="board-activity-time">{formatRelativeTime(item.timestamp)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
