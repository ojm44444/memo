import { useLiveQuery } from 'dexie-react-hooks'
import { getAllSongs, mergeSongsInto, getColumns } from '@/db/repositories/boardRepo'
import { getAudioVersions } from '@/db/repositories/audioRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { cn } from '@/lib/cn'
import { useState, useMemo } from 'react'

interface MergeSongPickerProps {
  targetSongId: string
  onClose: () => void
}

export function MergeSongPicker({ targetSongId, onClose }: MergeSongPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState(false)
  const [search, setSearch] = useState('')
  const [columnFilter, setColumnFilter] = useState('')
  const songs = useLiveQuery(() => getAllSongs())
  const columns = useLiveQuery(() => getColumns())

  const candidates = useMemo(() => {
    let list = songs?.filter((s) => s.id !== targetSongId) ?? []
    if (columnFilter) list = list.filter((s) => s.columnSlug === columnFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) => s.title.toLowerCase().includes(q))
    }
    return list
  }, [songs, targetSongId, columnFilter, search])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const merge = async () => {
    if (selected.size === 0) return
    setMerging(true)
    try {
      await mergeSongsInto(targetSongId, [...selected])
      scheduleFlush()
      onClose()
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="song-detail-section">
      <div className="mb-3 flex items-center justify-between">
        <span className="song-detail-label">Merge memos into this song</span>
        <button type="button" onClick={onClose} className="song-detail-link">
          Cancel
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Pick voice memos to combine. Audio stacks on this card; merged cards are removed.
      </p>

      <div className="merge-picker-filters">
        <input
          className="merge-picker-search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="merge-picker-column-select"
          value={columnFilter}
          onChange={(e) => setColumnFilter(e.target.value)}
        >
          <option value="">All sections</option>
          {columns?.map((col) => (
            <option key={col.id} value={col.slug}>{col.title}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex max-h-48 flex-col gap-2 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="text-xs text-muted">
            {search || columnFilter ? 'No songs match your filters.' : 'No other songs to merge yet.'}
          </p>
        )}
        {candidates.map((song) => (
          <MergeCandidateRow
            key={song.id}
            songId={song.id}
            title={song.title}
            columnSlug={song.columnSlug}
            selected={selected.has(song.id)}
            onToggle={() => toggle(song.id)}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={selected.size === 0 || merging}
        onClick={() => void merge()}
        className="song-detail-action w-full disabled:opacity-40"
      >
        {merging ? 'Merging…' : `Merge ${selected.size || ''} memo${selected.size === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

function MergeCandidateRow({
  songId,
  title,
  columnSlug,
  selected,
  onToggle,
}: {
  songId: string
  title: string
  columnSlug: string
  selected: boolean
  onToggle: () => void
}) {
  const versions = useLiveQuery(() => getAudioVersions(songId), [songId])

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        selected
          ? 'border-audio-mint/40 bg-audio-mint/8'
          : 'border-border bg-surface hover:border-text/20',
      )}
    >
      <span className="truncate font-medium">{title}</span>
      <span className="shrink-0 font-mono text-[0.58rem] text-muted">
        {columnSlug} · {versions?.length ?? 0} clip{(versions?.length ?? 0) === 1 ? '' : 's'}
      </span>
    </button>
  )
}
