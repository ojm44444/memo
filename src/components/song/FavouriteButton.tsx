import type { MouseEvent } from 'react'
import { toggleSongFavourite } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { cn } from '@/lib/cn'

interface FavouriteButtonProps {
  songId: string
  isFavourite: boolean
  size?: 'card' | 'drawer'
  className?: string
}

export function FavouriteButton({
  songId,
  isFavourite,
  size = 'card',
  className,
}: FavouriteButtonProps) {
  const toggle = async (e: MouseEvent) => {
    e.stopPropagation()
    await toggleSongFavourite(songId)
    scheduleFlush()
  }

  return (
    <button
      type="button"
      className={cn(
        'song-favourite-btn',
        size === 'drawer' && 'song-favourite-btn--drawer',
        isFavourite && 'is-active',
        className,
      )}
      onClick={(e) => void toggle(e)}
      aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={isFavourite}
    >
      {isFavourite ? '★' : '☆'}
    </button>
  )
}
