import { useUiStore, type BoardMode } from '@/stores/uiStore'

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
        Manage
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'listen'}
        className={boardMode === 'listen' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('listen')}
      >
        Favourites
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'library'}
        className={boardMode === 'library' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('library')}
      >
        Library
      </button>
    </div>
  )
}
