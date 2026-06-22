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
        <span className="board-mode-label-full">Manage</span>
        <span className="board-mode-label-short">▦</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'listen'}
        className={boardMode === 'listen' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('listen')}
      >
        <span className="board-mode-label-full">Favourites</span>
        <span className="board-mode-label-short">★</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={boardMode === 'library'}
        className={boardMode === 'library' ? 'board-mode-btn is-active' : 'board-mode-btn'}
        onClick={() => setMode('library')}
      >
        <span className="board-mode-label-full">Library</span>
        <span className="board-mode-label-short">≡</span>
      </button>
    </div>
  )
}
