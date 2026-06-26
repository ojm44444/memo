import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getColumns,
  getColumnSongCounts,
  mergeSongsInto,
  moveSong,
  reorderSongInColumn,
} from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { BoardFilterEmpty } from '@/components/board/BoardFilterEmpty'
import { RecentSongsRow } from '@/components/board/RecentSongsRow'
import { BoardActivityFeed } from '@/components/board/BoardActivityFeed'
import { BulkActionsBar } from '@/components/board/BulkActionsBar'
import { BoardOnboarding } from '@/components/board/BoardOnboarding'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { columnHeaderAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { cn } from '@/lib/cn'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { KanbanColumn } from './KanbanColumn'
import { DragOverlayCard } from './DragOverlay'
import type { ColumnSlug } from '@/types/column'
import type { Song } from '@/types/song'

interface KanbanBoardProps {
  readOnly?: boolean
}

export function KanbanBoard({ readOnly = false }: KanbanBoardProps) {
  const selectionMode = useUiStore((state) => state.selectionMode)
  const setDraggingCardId = useUiStore((state) => state.setDraggingCardId)
  const columnScrollSlug = useUiStore((state) => state.columnScrollSlug)
  const columnScrollNonce = useUiStore((state) => state.columnScrollNonce)
  const columns = useLiveQuery(() => getColumns())
  const columnCounts = useLiveQuery<Record<string, number>>(
    () => columns ? getColumnSongCounts(columns.map((c) => c.slug)) : Promise.resolve({}),
    [columns],
  )
  const activeProjectId = useLiveQuery(() => getActiveProjectId(), [])
  const accentHue = useLiveQuery(
    () => (activeProjectId ? getProjectAccentHue(activeProjectId) : Promise.resolve(null)),
    [activeProjectId],
  )
  const activeTabAccentStyle =
    activeProjectId != null
      ? {
          ...columnHeaderAccentStyle(activeProjectId, accentHue ?? null),
          ...projectAccentTextStyle(activeProjectId, accentHue ?? null),
        }
      : undefined
  const activeColumnId = usePlayerStore((state) => state.activeColumnId)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const playingColumnIndex =
    isPlaying && activeColumnId && columns
      ? columns.findIndex((column) => column.slug === activeColumnId)
      : -1

  const [activeSong, setActiveSong] = useState<Song | null>(null)
  const [activeColumnIndex, setActiveColumnIndex] = useState(0)
  const kanbanRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 20 } }),
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args)
    if (pointer.length > 0) return pointer
    return closestCenter(args)
  }, [])

  const scrollToColumn = useCallback((index: number) => {
    const el = kanbanRef.current
    if (!el) return
    const width = el.clientWidth
    el.scrollTo({ left: width * index, behavior: 'smooth' })
    setActiveColumnIndex(index)
  }, [])

  useEffect(() => {
    if (!columnScrollSlug || !columns?.length) return
    const index = columns.findIndex((column) => column.slug === columnScrollSlug)
    if (index >= 0) scrollToColumn(index)
  }, [columnScrollNonce, columnScrollSlug, columns, scrollToColumn])

  useEffect(() => {
    const el = kanbanRef.current
    if (!el) return

    const onScroll = () => {
      const width = el.clientWidth || 1
      const index = Math.round(el.scrollLeft / width)
      setActiveColumnIndex(index)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [columns?.length])

  const prevIsPlayingRef = useRef(false)
  const prevPlayingColumnRef = useRef(-1)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 900px)').matches
    const playbackStarted = isPlaying && !prevIsPlayingRef.current
    const columnChanged =
      isPlaying &&
      playingColumnIndex >= 0 &&
      prevPlayingColumnRef.current !== playingColumnIndex

    prevIsPlayingRef.current = isPlaying

    if (!mobile || playingColumnIndex < 0) return
    if (!playbackStarted && !columnChanged) return
    if (playingColumnIndex === activeColumnIndex) {
      prevPlayingColumnRef.current = playingColumnIndex
      return
    }

    prevPlayingColumnRef.current = playingColumnIndex
    scrollToColumn(playingColumnIndex)
  }, [isPlaying, playingColumnIndex, activeColumnIndex, scrollToColumn])

  const handleDragStart = (event: DragStartEvent) => {
    if (readOnly || selectionMode) return
    const song = event.active.data.current?.song as Song | undefined
    setActiveSong(song ?? null)
    if (song) setDraggingCardId(song.id)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const song = activeSong
    setActiveSong(null)
    setDraggingCardId(null)
    if (readOnly || selectionMode || !song) return

    const { active, over } = event
    if (!over) return

    const songId = String(active.id)
    const overData = over.data.current

    if (overData?.type === 'song-merge') {
      const targetSongId = overData.targetSongId as string
      if (targetSongId !== songId) {
        void mergeSongsInto(targetSongId, [songId])
        scheduleFlush()
      }
    } else if (overData?.type === 'column') {
      const targetColumn = overData.columnSlug as ColumnSlug
      if (song.columnSlug === targetColumn) {
        void reorderSongInColumn(songId, targetColumn, 999)
      } else {
        void moveSong(songId, targetColumn, 999)
      }
      scheduleFlush()
    } else if (overData?.type === 'song') {
      const targetColumn = overData.columnSlug as ColumnSlug
      const beforeSongId = String(over.id)
      if (song.columnSlug === targetColumn) {
        void reorderSongInColumn(songId, targetColumn, 999, beforeSongId)
      } else {
        void moveSong(songId, targetColumn, 999, beforeSongId)
      }
      scheduleFlush()
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {columns && columns.length > 0 && (
        <div className="board-column-tabs" role="tablist" aria-label="Board sections">
          {columns.map((column, index) => {
            const isScrolledActive = index === activeColumnIndex
            const isPlayingTab = playingColumnIndex === index
            const showAccent = (isScrolledActive || isPlayingTab) && !!activeProjectId

            return (
              <button
                key={column.id}
                type="button"
                role="tab"
                aria-selected={isScrolledActive}
                aria-label={
                  isPlayingTab ? `${column.title}, now playing` : column.title
                }
                title={
                  isPlayingTab && !isScrolledActive
                    ? `Jump to ${column.title} (now playing)`
                    : undefined
                }
                className={cn(
                  isScrolledActive && 'is-active',
                  isPlayingTab && !isScrolledActive && 'is-playing-column',
                  showAccent && 'has-project-accent',
                )}
                style={showAccent ? activeTabAccentStyle : undefined}
                onClick={() => scrollToColumn(index)}
              >
                {isPlayingTab && !isScrolledActive && (
                  <span className="board-column-tab-playing" aria-hidden>
                    ▶{' '}
                  </span>
                )}
                {column.title}
                {columnCounts && (columnCounts[column.slug] ?? 0) > 0 && (
                  <span className="board-column-tab-count">{columnCounts[column.slug]}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <BulkActionsBar />
      <RecentSongsRow />
      <BoardActivityFeed />
      <BoardOnboarding readOnly={readOnly} />
      <BoardFilterEmpty />

      <div
        className="board-kanban"
        ref={kanbanRef}
        style={{ '--column-count': columns?.length ?? 1 } as CSSProperties}
      >
        {columns?.map((column) => (
          <KanbanColumn key={column.id} column={column} readOnly={readOnly} />
        ))}
      </div>

      <DragOverlay>
        <DragOverlayCard song={activeSong} />
      </DragOverlay>
    </DndContext>
  )
}
