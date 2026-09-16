import { create } from 'zustand'
import type { ColumnSlug } from '@/types/column'
import type { MergeUndoRecord } from '@/db/repositories/boardRepo'

export type BoardMode = 'manage' | 'listen' | 'library'

interface UiState {
  selectedSongId: string | null
  drawerOpen: boolean
  boardMode: BoardMode
  onboardingTourNonce: number
  selectionMode: boolean
  selectedSongIds: string[]
  columnScrollSlug: ColumnSlug | null
  columnScrollNonce: number
  draggingCardId: string | null
  setDraggingCardId: (id: string | null) => void
  /**
   * The card a drag has been held over long enough to merge into, or null.
   * Merging used to arm on contact, over the whole card, so dropping a song
   * into a column that had songs in it merged it into whichever card was
   * under the pointer. Now it arms only after a deliberate pause.
   */
  armedMergeId: string | null
  setArmedMergeId: (id: string | null) => void
  /** The last merge, while its undo is still on offer. */
  mergeUndo: MergeUndoRecord | null
  showMergeUndo: (record: MergeUndoRecord | null) => void
  selectSong: (id: string | null) => void
  /**
   * A nonce, bumped when the drawer is opened specifically to rename.
   * The drawer focuses and selects the title field when it changes.
   *
   * A nonce rather than a boolean because someone can hit "Name it" on the
   * same card twice, and a boolean that is already true fires no effect the
   * second time.
   */
  drawerFocusTitleNonce: number
  openDrawer: (songId: string, opts?: { focusTitle?: boolean }) => void
  closeDrawer: () => void
  setBoardMode: (mode: BoardMode) => void
  requestOnboardingTour: () => void
  setSelectionMode: (enabled: boolean) => void
  toggleSongSelected: (songId: string) => void
  selectSongs: (songIds: string[]) => void
  replaceSelectedSongs: (songIds: string[]) => void
  deselectSongs: (songIds: string[]) => void
  clearSelectedSongs: () => void
  clearSelection: () => void
  requestColumnScroll: (columnSlug: ColumnSlug) => void
}

/* Open where you left off. Someone who only shares mixes should land on
   Listen every time, not on a songwriting board they never use. */
const MODE_KEY = 'sd-board-mode'

function savedBoardMode(): BoardMode {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'listen' ? 'listen' : 'manage'
  } catch {
    return 'manage'
  }
}

export const useUiStore = create<UiState>((set) => ({
  selectedSongId: null,
  drawerOpen: false,
  boardMode: savedBoardMode(),
  onboardingTourNonce: 0,
  selectionMode: false,
  selectedSongIds: [],
  columnScrollSlug: null,
  columnScrollNonce: 0,
  draggingCardId: null,
  armedMergeId: null,
  mergeUndo: null,
  drawerFocusTitleNonce: 0,

  setDraggingCardId: (id) => set({ draggingCardId: id }),
  setArmedMergeId: (id) => set({ armedMergeId: id }),
  showMergeUndo: (record) => set({ mergeUndo: record }),

  selectSong: (id) => set({ selectedSongId: id }),

  openDrawer: (songId, opts) =>
    set((state) => ({
      selectedSongId: songId,
      drawerOpen: true,
      drawerFocusTitleNonce: opts?.focusTitle
        ? state.drawerFocusTitleNonce + 1
        : state.drawerFocusTitleNonce,
    })),

  closeDrawer: () => set({ drawerOpen: false }),

  setBoardMode: (boardMode) => {
    try {
      localStorage.setItem(MODE_KEY, boardMode)
    } catch {
      /* private window: just do not remember */
    }
    set({ boardMode })
  },

  requestOnboardingTour: () =>
    set((state) => ({ onboardingTourNonce: state.onboardingTourNonce + 1 })),

  setSelectionMode: (enabled) =>
    set(enabled ? { selectionMode: true } : { selectionMode: false, selectedSongIds: [] }),

  toggleSongSelected: (songId) =>
    set((state) => {
      const selected = state.selectedSongIds.includes(songId)
        ? state.selectedSongIds.filter((id) => id !== songId)
        : [...state.selectedSongIds, songId]
      return { selectedSongIds: selected }
    }),

  selectSongs: (songIds) =>
    set((state) => ({
      selectionMode: true,
      selectedSongIds: [...new Set([...state.selectedSongIds, ...songIds])],
    })),

  replaceSelectedSongs: (songIds) =>
    set({
      selectionMode: true,
      selectedSongIds: [...new Set(songIds)],
    }),

  deselectSongs: (songIds) =>
    set((state) => ({
      selectedSongIds: state.selectedSongIds.filter((id) => !songIds.includes(id)),
    })),

  clearSelectedSongs: () => set({ selectedSongIds: [] }),

  clearSelection: () => set({ selectedSongIds: [], selectionMode: false }),

  requestColumnScroll: (columnSlug) =>
    set((state) => ({
      columnScrollSlug: columnSlug,
      columnScrollNonce: state.columnScrollNonce + 1,
    })),
}))
