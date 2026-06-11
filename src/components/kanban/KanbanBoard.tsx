import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getColumns,
  getSong,
  getSongsByColumn,
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
  const columnScrollSlug = useUiStore((state) => state.columnScrollSlug)
  const columnScrollNonce = useUiStore((state) => state.columnScrollNonce)
  const columns = useLiveQuery(() => getColumns())
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
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

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

  const handleDragStart = async (event: DragStartEvent) => {
    if (readOnly || selectionMode) return
    const song = await getSong(String(event.active.id))
    setActiveSong(song ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveSong(null)
    if (readOnly || selectionMode) return

    const { active, over } = event
    if (!over) return

    const songId = String(active.id)
    const song = await getSong(songId)
    if (!song) return

    const overData = over.data.current
    let targetColumn: ColumnSlug
    let targetIndex: number

    if (overData?.type === 'column') {
      targetColumn = overData.columnSlug as ColumnSlug
      const songsInColumn = await getSongsByColumn(targetColumn)
      targetIndex = songsInColumn.length
    } else if (overData?.type === 'song') {
      targetColumn = overData.columnSlug as ColumnSlug
      const songsInColumn = await getSongsByColumn(targetColumn)
      targetIndex = songsInColumn.findIndex((s) => s.id === over.id)
      if (targetIndex < 0) targetIndex = songsInColumn.length
    } else {
      return
    }

    if (song.columnSlug === targetColumn) {
      await reorderSongInColumn(songId, targetColumn, targetIndex)
    } else {
      await moveSong(songId, targetColumn, targetIndex)
    }

    scheduleFlush()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
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
