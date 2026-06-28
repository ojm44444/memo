import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  bulkAddTagToSongs,
  bulkDeleteSongs,
  bulkFavouriteSongs,
  bulkUnfavouriteSongs,
  bulkMoveSongs,
  getColumns,
  mergeSongsInto,
} from '@/db/repositories/boardRepo'
import { db } from '@/db/database'
import { createPlaylistShare } from '@/db/repositories/playlistShareRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import type { ColumnSlug } from '@/types/column'

export function BulkActionsBar() {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const selectedSongIds = useUiStore((state) => state.selectedSongIds)
  const clearSelection = useUiStore((state) => state.clearSelection)
  const clearSelectedSongs = useUiStore((state) => state.clearSelectedSongs)
  const columns = useLiveQuery(() => getColumns(), [])
  const [tagDraft, setTagDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [showMergePicker, setShowMergePicker] = useState(false)
  const [masterId, setMasterId] = useState('')

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

  const openMergePicker = () => {
    setMasterId(selectedSongIds[0] ?? '')
    setShowMergePicker(true)
  }

  const executeMerge = async () => {
    if (!masterId) return
    const sources = selectedSongIds.filter((id) => id !== masterId)
    if (sources.length === 0) return
    setBusy(true)
    try {
      await mergeSongsInto(masterId, sources)
      scheduleFlush()
      clearSelection()
      setShowMergePicker(false)
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
    <>
    {showMergePicker && (
      <BulkMergeModal
        songIds={selectedSongIds}
        masterId={masterId}
        busy={busy}
        onChangeMaster={setMasterId}
        onConfirm={() => void executeMerge()}
        onCancel={() => setShowMergePicker(false)}
      />
    )}
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

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void favourite()}>
        ★ Favourite
      </button>

      <button type="button" className="bulk-actions-btn" disabled={busy} onClick={() => void unfavourite()}>
        ☆ Unstar
      </button>

      {selectedSongIds.length >= 2 && (
        <button type="button" className="bulk-actions-btn" disabled={busy} onClick={openMergePicker}>
          Merge
        </button>
      )}

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
    </>
  )
}

interface BulkMergeModalProps {
  songIds: string[]
  masterId: string
  busy: boolean
  onChangeMaster: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function BulkMergeModal({ songIds, masterId, busy, onChangeMaster, onConfirm, onCancel }: BulkMergeModalProps) {
  const songs = useLiveQuery(
    () => db.songs.where('id').anyOf(songIds).toArray(),
    [songIds.join(',')],
  )

  return (
    <div className="bulk-merge-overlay" role="dialog" aria-modal="true" aria-label="Merge songs">
      <div className="bulk-merge-modal">
        <p className="bulk-merge-title">Merge {songIds.length} songs</p>
        <p className="bulk-merge-desc">
          All audio clips will stack onto the master song. The others are removed.
        </p>
        <label className="bulk-merge-label">
          Master song
          <select
            className="bulk-merge-select"
            value={masterId}
            disabled={busy}
            onChange={(e) => onChangeMaster(e.target.value)}
          >
            {songs?.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        <div className="bulk-merge-actions">
          <button type="button" className="bulk-actions-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="bulk-actions-danger" disabled={busy || !masterId} onClick={onConfirm}>
            {busy ? 'Merging…' : 'Merge songs'}
          </button>
        </div>
      </div>
    </div>
  )
}
