import { useLiveQuery } from 'dexie-react-hooks'
import { buildColumnPlaylist } from '@/lib/audio/buildColumnPlaylist'
import { usePlayerStore } from '@/stores/playerStore'
import type { ColumnSlug } from '@/types/column'

interface ColumnPlayButtonProps {
  columnSlug: ColumnSlug
  label: string
}

export function ColumnPlayButton({ columnSlug, label }: ColumnPlayButtonProps) {
  const playlist = useLiveQuery(() => buildColumnPlaylist(columnSlug), [columnSlug])
  const { activeColumnId, isPlaying, playColumn } = usePlayerStore()
  const isActive = activeColumnId === columnSlug && isPlaying
  const disabled = (playlist?.length ?? 0) === 0

  return (
    <button
      type="button"
      className={isActive ? 'column-play-btn is-active' : 'column-play-btn'}
      disabled={disabled}
      aria-label={`Play ${label} in order`}
      title={disabled ? 'No playable songs in this section' : `Play ${label} in order`}
      onClick={() => void playColumn(columnSlug)}
    >
      {isActive ? '▶ Playing' : '▶ Play'}
    </button>
  )
}
