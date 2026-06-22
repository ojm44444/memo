import type { Song } from '@/types/song'

interface DragOverlayProps {
  song: Song | null
}

export function DragOverlayCard({ song }: DragOverlayProps) {
  if (!song) return null

  return (
    <div className="song-card drag-overlay-card">
      <p className="song-card-title">{song.title}</p>
    </div>
  )
}
