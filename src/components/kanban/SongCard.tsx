import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/audio-utils'
import { getColumnTag } from '@/lib/column-tags'
import { db } from '@/db/database'
import { getShareFeedbackCount } from '@/db/repositories/shareFeedbackRepo'
import { FavouriteButton } from '@/components/song/FavouriteButton'
import { CachedWaveform } from '@/components/audio/CachedWaveform'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import type { Song } from '@/types/song'
import type { ColumnSlug } from '@/types/column'

interface SongCardProps {
  song: Song
  columnSlug: ColumnSlug
  readOnly?: boolean
}

export function SongCard({ song, columnSlug, readOnly = false }: SongCardProps) {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const isSelected = useUiStore((state) => state.selectedSongIds.includes(song.id))
  const toggleSongSelected = useUiStore((state) => state.toggleSongSelected)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.id,
    data: { type: 'song', columnSlug },
    disabled: readOnly || selectionMode,
  })

  const versions = useLiveQuery(
    () => db.audioVersions.where('songId').equals(song.id).sortBy('sortOrder'),
    [song.id],
  )
  const primary = versions?.[0]
  const mergeCount = (versions?.length ?? 0) - 1
  const feedbackCount = useLiveQuery(() => getShareFeedbackCount(song.id), [song.id])

  const { currentSongId, progress, isPlaying } = usePlayerStore()
  const { openDrawer } = useUiStore()
  const isActive = currentSongId === song.id && isPlaying
  const tag = getColumnTag(columnSlug)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handlePlay = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (!primary) return
    const store = usePlayerStore.getState()
    if (isActive) {
      store.setPlaying(false)
      return
    }
    await store.playAtVersion(columnSlug, song.id, primary.id)
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
      {...(readOnly || selectionMode ? {} : { ...attributes, ...listeners })}
      onClick={handleCardClick}
      className={cn(
        'song-card',
        isDragging && 'is-dragging',
        isActive && 'is-active',
        song.isFavourite && 'is-favourite',
        selectionMode && isSelected && 'is-selected',
      )}
    >
      <div className="song-card-title-row">
        {selectionMode && (
          <span className={cn('song-card-select', isSelected && 'is-checked')} aria-hidden="true">
            {isSelected ? '✓' : ''}
          </span>
        )}
        <p className="song-card-title">{song.title}</p>
        {(feedbackCount ?? 0) > 0 && (
          <span className="song-card-feedback-badge" title="Listener feedback on share link">
            {feedbackCount}
          </span>
        )}
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
            <span key={tag} className="song-card-tag-pill">
              {tag}
            </span>
          ))}
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
          <span className={cn('song-card-tag', tag.className)}>{tag.label}</span>
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
    </div>
  )
}
