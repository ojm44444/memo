import { useUiStore } from '@/stores/uiStore'

export function BoardSelectToggle() {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const setSelectionMode = useUiStore((state) => state.setSelectionMode)
  const selectedCount = useUiStore((state) => state.selectedSongIds.length)

  return (
    <button
      type="button"
      className={selectionMode ? 'board-select-toggle is-active' : 'board-select-toggle'}
      onClick={() => setSelectionMode(!selectionMode)}
      aria-pressed={selectionMode}
    >
      {selectionMode ? `Selecting${selectedCount ? ` (${selectedCount})` : ''}` : 'Select'}
    </button>
  )
}
