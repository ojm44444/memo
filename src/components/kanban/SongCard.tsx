import { memo, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/audio-utils'
import { tagHueStyle } from '@/lib/tagColors'
import { db } from '@/db/database'
import { getShareFeedbackCount } from '@/db/repositories/shareFeedbackRepo'
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

const isTouchOnlyDevice =
  typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches

export const SongCard = memo(function SongCard({ song, columnSlug, readOnly = false }: SongCardProps) {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const draggingCardId = useUiStore((state) => state.draggingCardId)
  const isSelected = useUiStore((state) => state.selectedSongIds.includes(song.id))
  const toggleSongSelected = useUiStore((state) => state.toggleSongSelected)

  const isMergeTarget = !readOnly && !isTouchOnlyDevice && draggingCardId !== null && draggingCardId !== song.id
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

  // A file that arrived with no audio in it. Clicking play on one of these did
  // nothing and said nothing, so it read as the app being broken. The card now
  // states what happened rather than offering a control that cannot work.
  // Two ways a card ends up unplayable: no audio version at all, or a version
  // that transferred as a zero-length file. Owen's board has the first kind and
  // my first attempt only caught the second, so the dead click survived.
  const isEmptyRecording = primary == null || (primary.durationMs ?? 0) === 0

  const handlePlay = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (!primary || isEmptyRecording) return
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
        isEmptyRecording && 'is-empty-recording',
      )}
    >
      {/* Header row: play btn + title + duration + fav */}
      <div className="song-card-header">
        {selectionMode ? (
          <span className={cn('song-card-select', isSelected && 'is-checked')} aria-hidden="true">
            {isSelected ? '✓' : ''}
          </span>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            className={cn('song-card-play', isActive && 'is-playing', isEmptyRecording && 'is-empty')}
            aria-label={isEmptyRecording ? 'This recording has no audio in it' : isActive ? 'Pause' : 'Play'}
            disabled={isEmptyRecording}
          >
            {isEmptyRecording ? '!' : isActive ? '❚❚' : '▶'}
          </button>
        )}
        <div className="song-card-title-group">
          <p className="song-card-title">{song.title}</p>
          {isEmptyRecording ? (
            <p className="song-card-empty-note">No audio in this one. Check the original.</p>
          ) : (
            song.locationName && <p className="song-card-location">{song.locationName}</p>
          )}
        </div>
        <span className="song-card-time">{formatDuration(primary?.durationMs)}</span>
        <FeedbackBadge songId={song.id} />
        {!readOnly && !selectionMode && (
          <div
            className="song-card-drag-handle"
            {...listeners}
            aria-label="Drag to reorder"
          >
            ⠿
          </div>
        )}
      </div>

      {/* Waveform — hero */}
      {primary && (
        <CachedWaveform
          versionId={primary.id}
          localBlobId={primary.localBlobId}
          storagePath={primary.storagePath}
          progress={isActive ? progress : 0}
          active={isActive}
          className="song-card-waveform"
        />
      )}

      {/* One tag, nothing else. The collapsed card carries five things: play,
          title, duration, waveform, one tag (the most recently added). Star,
          notes, key/bpm, merge count, date and the rest of the tags live in
          the open drawer — on open, not hover, because hover does not exist on
          a phone. The old footer put all of them on every card, which is how a
          240px card ended up giving its own title 68px. */}
      {(song.tags?.length ?? 0) > 0 && (
        <div className="song-card-footer">
          <span className="song-card-tag-pill" style={tagHueStyle(song.tags[song.tags.length - 1])}>
            {song.tags[song.tags.length - 1]}
          </span>
        </div>
      )}

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
