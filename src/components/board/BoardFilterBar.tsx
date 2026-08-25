import { useLiveQuery } from 'dexie-react-hooks'
import { clearAllBoardFilters, getBoardFilterSummary } from '@/db/repositories/projectRepo'

/**
 * A filter is a mode, so it has to look like one.
 *
 * Previously the only sign a filter was active was the search text sitting in
 * a small input, and columns with no matches still showed "Drop audio or drag
 * a song here". Five empty columns in an app holding someone's unreleased
 * songs reads as my work is gone, not my view is filtered. That is the worst
 * feeling this product can give someone, and it was reachable by typing in a
 * box and forgetting.
 *
 * Shows whenever any filter is on, not only when nothing matches.
 */
export function BoardFilterBar() {
  const summary = useLiveQuery(() => getBoardFilterSummary(), [])

  if (!summary?.active) return null

  const { parts, matched, total } = summary

  return (
    <div className="board-filter-bar" role="status">
      <span className="board-filter-bar-icon" aria-hidden>
        ⌕
      </span>
      <span className="board-filter-bar-text">
        Filtered by {parts.map((p, i) => (
          <span key={p}>
            {i > 0 && ' + '}
            <strong>{p}</strong>
          </span>
        ))}
      </span>
      <span className="board-filter-bar-count">
        {matched} of {total} {total === 1 ? 'song' : 'songs'}
      </span>
      <button
        type="button"
        className="board-filter-bar-clear"
        onClick={() => void clearAllBoardFilters()}
      >
        Clear filters
      </button>
    </div>
  )
}
