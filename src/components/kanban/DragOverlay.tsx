import type { Song } from '@/types/song'
import { Waveform } from '@/components/audio/Waveform'

interface DragOverlayProps {
  song: Song | null
}

export function DragOverlayCard({ song }: DragOverlayProps) {
  if (!song) return null

  return (
    <div className="song-card is-active w-[200px] shadow-2xl">
      <p className="song-card-title">{song.title}</p>
      <Waveform active />
    </div>
  )
}
