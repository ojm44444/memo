import { useEffect, useState } from 'react'
import { ensureSeeded } from '@/db/seed'
import { AppShell } from '@/components/layout/AppShell'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { ColumnPlayerBar } from '@/components/audio/ColumnPlayerBar'
import { SongDetailDrawer } from '@/components/song/SongDetailDrawer'
import { useSyncAuth } from '@/hooks/useSyncAuth'
import { initSyncEngine, registerBackgroundSync } from '@/sync/syncEngine'
import { AuthGate } from '@/components/auth/AuthGate'
import { AddSectionButton } from '@/components/board/AddSectionButton'
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle'
import { BoardFilters } from '@/components/board/BoardFilters'
import { BoardSearch } from '@/components/board/BoardSearch'
import { BoardModeToggle } from '@/components/board/BoardModeToggle'
import { LibraryView } from '@/components/board/LibraryView'
import { ListenView } from '@/components/board/ListenView'
import { useBoardRole } from '@/hooks/useBoardRole'
import { useShareFeedbackRefresh } from '@/hooks/useShareFeedbackRefresh'
import { useBoardKeyboardShortcuts } from '@/hooks/useBoardKeyboardShortcuts'
import { getDefaultPlaybackRate, getLoopMode } from '@/lib/preferences'
import { useShareImport } from '@/hooks/useShareImport'
import { BoardFrame } from '@/components/board/BoardFrame'
import { BoardProjectAccent } from '@/components/board/BoardProjectAccent'
import { ProjectSwitcher } from '@/components/board/ProjectSwitcher'
import { useUiStore } from '@/stores/uiStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useAudioImport } from '@/hooks/useAudioImport'
import { useGlobalFileDrop } from '@/hooks/useGlobalFileDrop'
import type { DropRejectReason } from '@/lib/extract-audio-files'
import { OnboardingTour } from '@/components/board/OnboardingTour'
import { ImportErrorToast } from '@/components/import/ImportErrorToast'
import { cn } from '@/lib/cn'
import '@/styles/board.css'

const DROP_ERRORS: Record<DropRejectReason, string> = {
  empty: "Couldn't read that file. Drag from Finder or use + Import audio.",
  icloud:
    'That file is still in iCloud. Download it in Finder first, then drop again.',
  'voice-memos-app':
    'Drag from Finder doesn\'t work with Voice Memos. Use + Import audio on mobile.',
  unsupported: "That file type isn't supported.",
}

function FileDropLayer({ enabled }: { enabled: boolean }) {
  const { importing, importFiles } = useAudioImport('inbox')
  const [fileDragActive, setFileDragActive] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)

  useGlobalFileDrop({
    enabled,
    onDragStateChange: (active) => {
      setFileDragActive(active)
      if (active) setImportError(null)
    },
    onImport: (files) => {
      void importFiles(files, 'inbox').then(({ imported, duplicates }) => {
        if (imported > 0) {
          setImportSuccess(
            imported === 1 ? '1 memo added to Inbox' : `${imported} memos added to Inbox`,
          )
        }
        if (duplicates.length > 0) {
          setImportError(
            duplicates.length === 1
              ? `Already imported: ${duplicates[0]}`
              : `${duplicates.length} files already imported — skipped`,
          )
        }
      })
    },
    onImportFailed: (reason) => {
      setImportError(DROP_ERRORS[reason])
    },
  })

  if (!enabled) return null

  return (
    <>
      <div
        className={cn('board-drop-overlay board-drop-overlay--global', fileDragActive && 'is-active')}
        aria-hidden={!fileDragActive}
      >
        <div className="board-drop-edge" />
        <div className="board-drop-banner">
          <span className="board-drop-banner-icon">↓</span>
          <div>
            <p className="board-drop-banner-title">Drop to Inbox</p>
            <p className="board-drop-banner-sub">
              {importing ? 'Importing…' : 'Release anywhere — file goes to Inbox'}
            </p>
          </div>
        </div>
      </div>
      <ImportErrorToast message={importError} onDismiss={() => setImportError(null)} />
      <ImportErrorToast
        message={importSuccess}
        tone="success"
        onDismiss={() => setImportSuccess(null)}
      />
    </>
  )
}

function AuthenticatedBoard() {
  const boardMode = useUiStore((s) => s.boardMode)
  const boardRole = useBoardRole()
  const readOnly = boardRole === 'viewer' || boardRole === 'editor'
  const { shareImportMessage, clearShareImportMessage } = useShareImport()
  useSyncAuth()

  useShareFeedbackRefresh(boardRole === 'owner')
  useBoardKeyboardShortcuts()

  useEffect(() => {
    void ensureSeeded()
    initSyncEngine()
    void registerBackgroundSync()
    void getDefaultPlaybackRate().then((rate) => {
      usePlayerStore.getState().setPlaybackRate(rate)
    })
    void getLoopMode().then((mode) => {
      usePlayerStore.getState().setLoopMode(mode)
    })
  }, [])

  return (
    <>
      <FileDropLayer enabled={boardMode === 'manage' && !readOnly} />
      <AppShell>
        <div className="board-page">
          <div className="board-workspace">
            <BoardFrame>
              <div className="board-titlebar">
                <span className="board-dot board-dot-r" />
                <span className="board-dot board-dot-y" />
                <span className="board-dot board-dot-g" />
                <BoardProjectAccent />
                <span className="board-titlebar-text">mem• — songwriting board</span>
                <div className="board-titlebar-actions">
                  <BoardModeToggle />
                  <BoardSearch />
                  <ProjectSwitcher readOnly={readOnly} />
                  <BoardFilters readOnly={readOnly} />
                  {boardMode === 'manage' && !readOnly && (
                    <>
                      <BoardSelectToggle />
                      <AddSectionButton />
                    </>
                  )}
                </div>
              </div>
              {boardMode === 'listen' ? (
                <ListenView />
              ) : boardMode === 'library' ? (
                <LibraryView readOnly={readOnly} />
              ) : (
                <KanbanBoard readOnly={readOnly} />
              )}
            </BoardFrame>
          </div>
          <ColumnPlayerBar />
        </div>
        <SongDetailDrawer readOnly={readOnly} />
        <OnboardingTour readOnly={readOnly} />
      </AppShell>
      <ImportErrorToast
        message={shareImportMessage}
        tone="success"
        onDismiss={clearShareImportMessage}
      />
    </>
  )
}

export function BoardPage() {
  return (
    <AuthGate>
      <AuthenticatedBoard />
    </AuthGate>
  )
}
