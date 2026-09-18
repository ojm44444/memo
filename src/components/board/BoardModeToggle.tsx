import { useUiStore, type BoardMode } from '@/stores/uiStore'

/**
 * Songwriting and Listen. Library was a third tab and Owen called it what it
 * was: not a place anyone goes. Its trash lives in Settings now, and board
 * projects are switched from the top bar.
 */
export function BoardModeToggle() {
  const { boardMode, setBoardMode } = useUiStore()

  const setMode = (mode: BoardMode) => setBoardMode(mode)

  return (
    <div className="board-mode-toggle" role="tablist" aria-label="Board mode">
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'manage'}
        className={boardMode === 'manage' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('manage')}
      >
        <span className="board-mode-label-full">Songwriting</span>
        <span className="board-mode-label-short">Write</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'listen'}
        className={boardMode === 'listen' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('listen')}
      >
        <span className="board-mode-label-full">Listen</span>
        <span className="board-mode-label-short">Listen</span>
      </button>
    </div>
  )
}
