import { memo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useLiveQuery } from 'dexie-react-hooks'
import { cn } from '@/lib/cn'
import { getSongsByColumn } from '@/db/repositories/boardRepo'
import { ColumnPlayButton } from '@/components/board/ColumnPlayButton'
import { ColumnSectionMenu } from '@/components/board/ColumnSectionMenu'
import { AddMemoButton } from '@/components/import/AddMemoButton'
import { MobileImportCard } from '@/components/import/VoiceMemosShareCard'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { columnHeaderAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { SongCard } from './SongCard'
import type { Column } from '@/types/column'

const PAGE_SIZE = 50

interface KanbanColumnProps {
  column: Column
  readOnly?: boolean
}

export const KanbanColumn = memo(function KanbanColumn({ column, readOnly = false }: KanbanColumnProps) {
  const activeColumnId = usePlayerStore((state) => state.activeColumnId)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const isActiveColumn = activeColumnId === column.slug && isPlaying
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )
  const headerAccentStyle =
    isActiveColumn && activeProjectId
      ? columnHeaderAccentStyle(activeProjectId, accentHue ?? null)
      : undefined
  const titleAccentStyle =
    isActiveColumn && activeProjectId
      ? projectAccentTextStyle(activeProjectId, accentHue ?? null)
      : undefined

  const selectionMode = useUiStore((state) => state.selectionMode)
  const selectedSongIds = useUiStore((state) => state.selectedSongIds)
  const selectSongs = useUiStore((state) => state.selectSongs)
  const deselectSongs = useUiStore((state) => state.deselectSongs)

  const { setNodeRef, isOver } = useDroppable({
    id: column.slug,
    data: { type: 'column', columnSlug: column.slug },
    disabled: readOnly,
  })

  const songs = useLiveQuery(() => getSongsByColumn(column.slug), [column.slug])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const songIds = songs?.map((s) => s.id) ?? []
  const visibleSongs = songs?.slice(0, visibleCount) ?? []
  const hiddenCount = (songs?.length ?? 0) - visibleCount
  const isEmpty = songs !== undefined && songs.length === 0
  const isLoading = songs === undefined
  const allSelected =
    songIds.length > 0 && songIds.every((songId) => selectedSongIds.includes(songId))

  return (
    <div
      ref={setNodeRef}
      data-column-slug={column.slug}
      className={cn('board-column', isOver && 'is-over')}
    >
      <div
        className={cn('board-column-header', isActiveColumn && 'is-active-column')}
        style={headerAccentStyle}
      >
        <span style={titleAccentStyle}>{column.title}</span>
        <div className="board-column-header-actions">
          {selectionMode && !readOnly && songIds.length > 0 && (
            <button
              type="button"
              className="column-select-all-btn"
              onClick={() => (allSelected ? deselectSongs(songIds) : selectSongs(songIds))}
            >
              {allSelected ? 'None' : 'All'}
            </button>
          )}
          <ColumnPlayButton columnSlug={column.slug} label={column.title} />
          <span className="board-column-count">{songs?.length ?? 0}</span>
          {!readOnly && <ColumnSectionMenu column={column} />}
        </div>
      </div>

      <SortableContext items={songIds} strategy={verticalListSortingStrategy}>
        <div className="board-column-scroll">
          {isLoading && (
            <div className="board-column-loading">
              <span className="board-column-loading-bar" />
              <span className="board-column-loading-bar" style={{ width: '70%' }} />
              <span className="board-column-loading-bar" style={{ width: '85%' }} />
            </div>
          )}
          {visibleSongs.map((song) => (
            <SongCard key={song.id} song={song} columnSlug={column.slug} readOnly={readOnly} />
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              className="column-show-more"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Show {Math.min(hiddenCount, PAGE_SIZE)} more of {hiddenCount} songs
            </button>
          )}

          {isEmpty && column.slug !== 'inbox' && (
            <div className="board-empty-hint">Drop audio or drag a song here</div>
          )}

          {/* Always render a bottom drop zone so cards can be dropped into full columns */}
          {!isEmpty && !readOnly && (
            <div
              className={cn('column-bottom-drop-zone', isOver && 'is-over')}
              aria-hidden="true"
            />
          )}

          {column.slug === 'inbox' && !readOnly && (
            <>
              {isEmpty && <MobileImportCard />}
              <AddMemoButton />
            </>
          )}
        </div>
      </SortableContext>
    </div>
  )
})
