import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  bulkAddTagToSongs,
  bulkDeleteSongs,
  bulkFavouriteSongs,
  bulkUnfavouriteSongs,
  bulkMoveSongs,
  getColumns,
  getSongIdsInActiveProject,
} from '@/db/repositories/boardRepo'
import { createPlaylistShare } from '@/db/repositories/playlistShareRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import type { ColumnSlug } from '@/types/column'

export function BulkActionsBar() {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const selectedSongIds = useUiStore((state) => state.selectedSongIds)
  const replaceSelectedSongs = useUiStore((state) => state.replaceSelectedSongs)
  const clearSelection = useUiStore((state) => state.clearSelection)
  const clearSelectedSongs = useUiStore((state) => state.clearSelectedSongs)
  const columns = useLiveQuery(() => getColumns(), [])
  const [tagDraft, setTagDraft] = useState('')
  const [busy, setBusy] = useState(false)

  if (!selectionMode && selectedSongIds.length === 0) return null

  const moveTo = async (columnSlug: ColumnSlug) => {
    setBusy(true)
    try {
      await bulkMoveSongs(selectedSongIds, columnSlug)
      scheduleFlush()
      clearSelection()
    } finally {
      setBusy(false)
    }
  }

  const addTag = async () => {
    const tag = tagDraft.trim()
    if (!tag) return
    setBusy(true)
    try {
      await bulkAddTagToSongs(selectedSongIds, tag)
      scheduleFlush()
      setTagDraft('')
    } finally {
      setBusy(false)
    }
  }

  const favourite = async () => {
    setBusy(true)
    try {
      await bulkFavouriteSongs(selectedSongIds)
      scheduleFlush()
    } finally {
      setBusy(false)
    }
  }

  const unfavourite = async () => {
    setBusy(true)
    try {
      await bulkUnfavouriteSongs(selectedSongIds)
      scheduleFlush()
    } finally {
      setBusy(false)
    }
  }

  const invert = async () => {
    setBusy(true)
    try {
      const projectSongIds = await getSongIdsInActiveProject()
      const selected = new Set(selectedSongIds)
      const inverted = projectSongIds.filter((songId) => !selected.has(songId))
      replaceSelectedSongs(inverted)
    } finally {
      setBusy(false)
    }
  }

  const shareAsPlaylist = async () => {
    if (selectedSongIds.length === 0) return
    setBusy(true)
    try {
      const url = await createPlaylistShare(selectedSongIds)
      await navigator.clipboard.writeText(url)
      alert(`Playlist link copied!\n\n${url}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create playlist link')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (
      !confirm(
        `Delete ${selectedSongIds.length} song${selectedSongIds.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      usePlayerStore.getState().stop()
      await bulkDeleteSongs(selectedSongIds)
      scheduleFlush()
      clearSelection()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bulk-actions-bar" role="toolbar" aria-label="Bulk song actions">
      <span className="bulk-actions-count">
        {selectedSongIds.length} selected
      </span>

      <label className="bulk-actions-field">
        <span className="sr-only">Move to section</span>
        <select
          className="bulk-actions-select"
          disabled={busy}
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value as ColumnSlug
            if (!value) return
            void moveTo(value)
            event.target.value = ''
          }}
        >
          <option value="">Move to…</option>
          {columns?.map((column) => (
            <option key={column.id} value={column.slug}>
              {column.title}
            </option>
          ))}
        </select>
      </label>

      <div className="bulk-actions-tag">
        <input
          className="bulk-actions-input"
          placeholder="Add tag…"
          value={tagDraft}
          disabled={busy}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void addTag()
          }}
        />
        <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void addTag()}>
          Tag
        </button>
      </div>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void invert()}>
        Invert
      </button>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void favourite()}>
        ★ Favourite
      </button>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void unfavourite()}>
        ☆ Unstar
      </button>

      <button type="button" className="bulk-actions-danger" disabled={busy} onClick={() => void remove()}>
        Delete
      </button>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void shareAsPlaylist()}>
        ↗ Share playlist
      </button>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={clearSelectedSongs}>
        Clear
      </button>

      <button type="button" className="bulk-actions-cancel" disabled={busy} onClick={clearSelection}>
        Done
      </button>
    </div>
  )
}
