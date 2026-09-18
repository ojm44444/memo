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
  type DragOverEvent,
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
import { BoardFilterBar } from '@/components/board/BoardFilterBar'
import { DuplicateProjectNotice } from '@/components/board/DuplicateProjectNotice'
import { RecentSongsRow } from '@/components/board/RecentSongsRow'
import { BoardActivityFeed } from '@/components/board/BoardActivityFeed'
import { BulkActionsBar } from '@/components/board/BulkActionsBar'
import { BoardOnboarding } from '@/components/board/BoardOnboarding'
import { getActiveProjectId, getProjectAccentHue } from '@/db/repositories/projectRepo'
import { columnHeaderAccentStyle, projectAccentTextStyle } from '@/lib/projectAccent'
import { cn } from '@/lib/cn'
import { stageColorAt } from '@/lib/stageColor'
import { usePlayerStore } from '@/stores/playerStore'
import { useUiStore } from '@/stores/uiStore'
import { repeatedStems } from '@/lib/unnamedTitles'
import { db } from '@/db/database'
import { KanbanColumn } from './KanbanColumn'
import { BoardHero } from './BoardHero'
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
  // Computed once for the whole board, not per card: whether a title is an
  // iOS location auto-name is a fact about the library, not the title.
  const unnamedStems = useLiveQuery(
    async () => repeatedStems((await db.songs.toArray()).map((song) => song.title)),
    [],
  )
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
  // Optimistic move: track a pending column change so the card visually
  // moves immediately on drop, before Dexie confirms the write.
  const [optimisticMove, setOptimisticMove] = useState<{ songId: string; song: Song; toColumn: ColumnSlug } | null>(null)
  const kanbanRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 25 } }),
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
    clearMergeDwell()
    if (readOnly || selectionMode) return
    const song = event.active.data.current?.song as Song | undefined
    setActiveSong(song ?? null)
    if (song) setDraggingCardId(song.id)
  }

  /* Merge arms on a pause, never on contact.
     The merge target used to cover the whole of every card and arm the moment
     the pointer touched it, so dropping a song anywhere near another song
     merged the two: takes moved, the source deleted, no confirmation. On
     8 Sept that is how "All of my life I have been waiting" ended up stacked
     under "Sad piano riff". Now a card has to be held over another card for
     MERGE_DWELL_MS before "Release to merge" appears, and only then does a
     release merge. A normal drag passes over cards without stopping, so it
     can no longer merge by accident, and a merge that does happen gets an
     undo. */
  const MERGE_DWELL_MS = 700
  const mergeTimerRef = useRef<number | null>(null)
  const mergeCandidateRef = useRef<string | null>(null)

  const clearMergeDwell = useCallback(() => {
    if (mergeTimerRef.current != null) window.clearTimeout(mergeTimerRef.current)
    mergeTimerRef.current = null
    mergeCandidateRef.current = null
    useUiStore.getState().setArmedMergeId(null)
  }, [])

  useEffect(() => clearMergeDwell, [clearMergeDwell])

  /* No live move preview here any more, and that is what fixes the crash.
     This handler used to MOVE the real card into the column under the pointer
     while the drag was still going. Remounted there, the card reported that
     it was already in the target column, so the next event decided there was
     nothing to move and moved it back; back home it reported the old column
     again, and the event moved it forward. That flip ran without end until
     React stopped it with error #185 and took the whole board down. The
     DragOverlay already follows the pointer and the column under it lights
     up, so the preview bought nothing. The card moves once, on drop. */
  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (readOnly || selectionMode) return
    const activeId = String(event.active.id)
    const overData = event.over?.data.current

    const hoveredSongId =
      overData?.type === 'song' ? String(event.over!.id)
      : overData?.type === 'song-merge' ? String(overData.targetSongId)
      : null

    // Still over the same card (or onto its armed merge zone): keep the dwell.
    if (hoveredSongId && hoveredSongId === mergeCandidateRef.current) return

    clearMergeDwell()
    if (!hoveredSongId || hoveredSongId === activeId) return

    mergeCandidateRef.current = hoveredSongId
    mergeTimerRef.current = window.setTimeout(() => {
      if (mergeCandidateRef.current === hoveredSongId) {
        useUiStore.getState().setArmedMergeId(hoveredSongId)
      }
    }, MERGE_DWELL_MS)
  }, [readOnly, selectionMode, clearMergeDwell])

  const handleDragEnd = (event: DragEndEvent) => {
    const song = activeSong
    const armedMergeId = useUiStore.getState().armedMergeId
    clearMergeDwell()
    setActiveSong(null)
    setDraggingCardId(null)
    setOptimisticMove(null)
    if (readOnly || selectionMode || !song) return

    const { active, over } = event
    if (!over) return

    const songId = String(active.id)
    const overData = over.data.current

    /* Only a merge zone that had been armed by a pause counts. If the drop
       lands on a merge zone some other way, treat it as an ordinary drop on
       that card rather than a merge. */
    if (overData?.type === 'song-merge' && armedMergeId === overData.targetSongId) {
      const targetSongId = overData.targetSongId as string
      if (targetSongId !== songId) {
        void mergeSongsInto(targetSongId, [songId]).then((record) => {
          if (record) useUiStore.getState().showMergeUndo(record)
          scheduleFlush()
        })
      }
      return
    }

    if (overData?.type === 'song-merge') {
      const targetSongId = String(overData.targetSongId)
      const targetColumn = overData.columnSlug as ColumnSlug | undefined
      if (!targetColumn) return
      if (song.columnSlug !== targetColumn) {
        setOptimisticMove({ songId, song, toColumn: targetColumn })
        void moveSong(songId, targetColumn, 999, targetSongId).then(() => setOptimisticMove(null))
      } else {
        void reorderSongInColumn(songId, targetColumn, 999, targetSongId)
      }
      scheduleFlush()
    } else if (overData?.type === 'column') {
      const targetColumn = overData.columnSlug as ColumnSlug
      if (song.columnSlug !== targetColumn) {
        setOptimisticMove({ songId, song, toColumn: targetColumn })
        void moveSong(songId, targetColumn, 999).then(() => setOptimisticMove(null))
      } else {
        void reorderSongInColumn(songId, targetColumn, 999)
      }
      scheduleFlush()
    } else if (overData?.type === 'song') {
      const targetColumn = overData.columnSlug as ColumnSlug
      const beforeSongId = String(over.id)
      if (song.columnSlug !== targetColumn) {
        setOptimisticMove({ songId, song, toColumn: targetColumn })
        void moveSong(songId, targetColumn, 999, beforeSongId).then(() => setOptimisticMove(null))
      } else {
        void reorderSongInColumn(songId, targetColumn, 999, beforeSongId)
      }
      scheduleFlush()
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        clearMergeDwell()
        setActiveSong(null)
        setDraggingCardId(null)
        setOptimisticMove(null)
      }}
    >
      <BoardHero
        songCount={Object.values(columnCounts ?? {}).reduce((a, b) => a + b, 0)}
        stageCount={columns?.length ?? 0}
      />

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
                style={{
                  ...(showAccent ? activeTabAccentStyle : undefined),
                  // Each tab carries its column's stage colour, so the phone
                  // strip shows the same cold-to-warm ramp as the desktop board.
                  ['--stage-ink' as string]: stageColorAt(index, columns.length),
                }}
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
      {/* One strip for both: on phone they sit side by side as two small
          toggles instead of two full-width bands above the columns. */}
      <div className="board-strips">
        <RecentSongsRow />
        <BoardActivityFeed />
      </div>
      <BoardOnboarding readOnly={readOnly} />
      <DuplicateProjectNotice />
      <BoardFilterBar />
      <BoardFilterEmpty />

      <div
        className="board-kanban"
        ref={kanbanRef}
        style={{ '--column-count': columns?.length ?? 1 } as CSSProperties}
      >
        {columns?.map((column, index) => (
          <KanbanColumn
            unnamedStems={unnamedStems}
            key={column.id}
            column={column}
            stageIndex={index}
            stageTotal={columns?.length ?? 1}
            readOnly={readOnly}
            optimisticHideSongId={optimisticMove?.toColumn !== column.slug ? (optimisticMove?.songId ?? null) : null}
            optimisticShowSong={optimisticMove?.toColumn === column.slug ? optimisticMove.song : null}
          />
        ))}
      </div>

      <DragOverlay>
        <DragOverlayCard song={activeSong} />
      </DragOverlay>
    </DndContext>
  )
}
