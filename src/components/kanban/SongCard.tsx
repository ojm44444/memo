import { memo, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/audio-utils'
import { getTagGradient } from '@/lib/tagColors'
import { db } from '@/db/database'
import { getShareFeedbackCount } from '@/db/repositories/shareFeedbackRepo'
import { FavouriteButton } from '@/components/song/FavouriteButton'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { playAudioImmediately, unlockAudioEl } from '@/lib/audio/globalAudioEl'
import { getCachedUrl, resolvePlaybackUrl } from '@/lib/audio/resolvePlaybackUrl'
import type { Song } from '@/types/song'
import type { ColumnSlug } from '@/types/column'

// Isolated so feedbackCount live query doesn't force the whole card to re-render
const FeedbackBadge = memo(({ songId }: { songId: string }) => {
  const count = useLiveQuery(() => getShareFeedbackCount(songId), [songId])
  if (!count) return null
  return <span className="song-card-feedback-badge" title="Listener feedback">{count}</span>
})

interface SongCardProps {
  song: Song
  columnSlug: ColumnSlug
  readOnly?: boolean
}

export const SongCard = memo(function SongCard({ song, columnSlug, readOnly = false }: SongCardProps) {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const draggingCardId = useUiStore((state) => state.draggingCardId)
  const isSelected = useUiStore((state) => state.selectedSongIds.includes(song.id))
  const toggleSongSelected = useUiStore((state) => state.toggleSongSelected)

  const isMergeTarget = !readOnly && draggingCardId !== null && draggingCardId !== song.id
  const { setNodeRef: setMergeNodeRef, isOver: isMergeOver } = useDroppable({
    id: `merge:${song.id}`,
    data: { type: 'song-merge', targetSongId: song.id },
    disabled: !isMergeTarget,
  })

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.id,
    data: { type: 'song', columnSlug, song },
    disabled: readOnly || selectionMode,
  })

  const versions = useLiveQuery(
    () => db.audioVersions.where('songId').equals(song.id).sortBy('sortOrder'),
    [song.id],
  )
  const primary = versions?.[0]
  const mergeCount = (versions?.length ?? 0) - 1

  const { currentSongId, progress, isPlaying } = usePlayerStore()
  const { openDrawer } = useUiStore()
  const isActive = currentSongId === song.id && isPlaying

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Warm the URL cache as soon as the card renders so tapping play is instant.
  // CachedWaveform also calls resolvePlaybackUrl but this fires first (no IDB peaks check).
  useEffect(() => {
    if (!primary) return
    // Local blobs: resolve immediately (createObjectURL is synchronous after the IDB read).
    // Remote-only: short delay so we don't hammer Supabase on board load.
    if (primary.localBlobId) {
      void resolvePlaybackUrl(primary.localBlobId, null)
    } else {
      // Stagger cloud URL resolution so cards don't all hit Supabase at once
      // on board load, but keep the delay short so tapping play works on iOS.
      const delay = 80 + Math.random() * 120
      const id = setTimeout(
        () => void resolvePlaybackUrl(null, primary.storagePath),
        delay,
      )
      return () => clearTimeout(id)
    }
  }, [primary?.id, primary?.localBlobId, primary?.storagePath])

  const handlePlay = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (!primary) return
    const store = usePlayerStore.getState()
    if (isActive) {
      store.setPlaying(false)
      return
    }
    // Play synchronously in the gesture handler so iOS doesn't block it.
    const cachedUrl = getCachedUrl(primary.localBlobId, primary.storagePath)
    const rate = store.playbackRate
    if (cachedUrl) {
      playAudioImmediately(cachedUrl, rate)
    } else {
      unlockAudioEl()
    }
    void store.playAtVersion(columnSlug, song.id, primary.id)
  }

  const handleCardClick = () => {
    if (selectionMode) {
      toggleSongSelected(song.id)
      return
    }
    openDrawer(song.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly || selectionMode ? {} : { ...attributes })}
      onClick={handleCardClick}
      className={cn(
        'song-card',
        isDragging && 'is-dragging',
        isActive && 'is-active',
        song.isFavourite && 'is-favourite',
        selectionMode && isSelected && 'is-selected',
      )}
    >
      {!readOnly && !selectionMode && (
        <div
          className="song-card-drag-handle"
          {...listeners}
          aria-label="Drag to reorder"
        >
          ⠿
        </div>
      )}
      <div className="song-card-title-row">
        {selectionMode && (
          <span className={cn('song-card-select', isSelected && 'is-checked')} aria-hidden="true">
            {isSelected ? '✓' : ''}
          </span>
        )}
        <p className="song-card-title">{song.title}</p>
        {song.locationName && (
          <p className="song-card-location">{song.locationName}</p>
        )}
        <FeedbackBadge songId={song.id} />
        {!readOnly && (
          <FavouriteButton songId={song.id} isFavourite={song.isFavourite ?? false} />
        )}
      </div>
      {song.notes.trim() && <p className="song-card-notes-snippet">{song.notes.trim()}</p>}
      {(song.musicalKey || song.bpm) && (
        <div className="song-card-meta-pills">
          {song.musicalKey && <span className="song-card-meta-pill">{song.musicalKey}</span>}
          {song.bpm && <span className="song-card-meta-pill">{song.bpm} bpm</span>}
        </div>
      )}
      {(song.tags?.length ?? 0) > 0 && (
        <div className="song-card-tags">
          {song.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="song-card-tag-pill"
              style={{ background: getTagGradient(tag), border: 'none', color: '#fff' }}
            >
              {tag}
            </span>
          ))}
          {song.tags.length > 3 && (
            <span className="song-card-tag-pill song-card-tag-overflow">
              +{song.tags.length - 3}
            </span>
          )}
        </div>
      )}
      {primary && (
        <CachedWaveform
          versionId={primary.id}
          localBlobId={primary.localBlobId}
          storagePath={primary.storagePath}
          progress={isActive ? progress : 0}
          active={isActive}
        />
      )}
      <div className="song-card-meta">
        <div className="song-card-time-row">
          <span className="song-card-time">{formatDuration(primary?.durationMs)}</span>
          {song.recordedAt && (
            <span className="song-card-recorded-date">
              {new Date(song.recordedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {primary && (
            <span
              className={cn('song-card-offline-dot', primary.localBlobId ? 'is-cached' : 'is-cloud')}
              title={primary.localBlobId ? 'Available offline' : 'Requires internet'}
              aria-label={primary.localBlobId ? 'Available offline' : 'Requires internet'}
            />
          )}
          <button
            type="button"
            onClick={handlePlay}
            className={cn('song-card-play', isActive && 'is-playing')}
            aria-label={isActive ? 'Pause' : 'Play'}
          >
            {isActive ? '❚❚' : '▶'}
          </button>
        </div>
      </div>
      {mergeCount > 0 && <span className="song-card-merge">+{mergeCount} merged</span>}
      {isMergeTarget && (
        <div
          ref={setMergeNodeRef}
          className={cn('song-card-merge-zone', isMergeOver && 'is-over')}
          aria-hidden="true"
        >
          <span className="song-card-merge-zone-label">⊕ merge here</span>
        </div>
      )}
    </div>
  )
})
