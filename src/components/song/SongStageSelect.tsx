import { useLiveQuery } from 'dexie-react-hooks'
import { getColumns, moveSong } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import type { ColumnSlug } from '@/types/column'

interface SongStageSelectProps {
  songId: string
  columnSlug: ColumnSlug
  readOnly?: boolean
}

export function SongStageSelect({ songId, columnSlug, readOnly = false }: SongStageSelectProps) {
  const columns = useLiveQuery(() => getColumns(), [])

  const onChange = async (slug: string) => {
    if (slug === columnSlug) return
    await moveSong(songId, slug as ColumnSlug, 0)
    scheduleFlush()
  }

  if (readOnly) {
    const column = columns?.find((entry) => entry.slug === columnSlug)
    return <span className="song-stage-readonly">{column?.title ?? columnSlug}</span>
  }

  return (
    <label className="song-stage-select">
      <span className="song-stage-label">Stage</span>
      <select
        className="song-stage-input"
        value={columnSlug}
        onChange={(e) => void onChange(e.target.value)}
      >
        {columns?.map((column) => (
          <option key={column.id} value={column.slug}>
            {column.title}
          </option>
        ))}
      </select>
    </label>
  )
}
