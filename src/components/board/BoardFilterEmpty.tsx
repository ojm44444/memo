import { useLiveQuery } from 'dexie-react-hooks'
import { getAllSongs } from '@/db/repositories/boardRepo'
import {
  clearAllBoardFilters,
  getActiveProjectId,
  hasActiveBoardFilters,
} from '@/db/repositories/projectRepo'
import { db } from '@/db/database'

export function BoardFilterEmpty() {
  const visibleCount = useLiveQuery(() => getAllSongs().then((songs) => songs.length), [])
  const filtersActive = useLiveQuery(() => hasActiveBoardFilters(), [])
  const totalCount = useLiveQuery(async () => {
    const projectId = await getActiveProjectId()
    return db.songs.filter((song) => !song.deletedAt && song.projectId === projectId).count()
  }, [])

  if (!filtersActive || (visibleCount ?? 0) > 0 || (totalCount ?? 0) === 0) return null

  return (
    <div className="board-filter-empty">
      <p className="board-filter-empty-title">No songs match your filters</p>
      <p className="board-filter-empty-sub">Try a different search or clear filters to see the full board.</p>
      <button type="button" className="board-filter-empty-btn" onClick={() => void clearAllBoardFilters()}>
        Clear filters
      </button>
    </div>
  )
}
