import { Link } from 'react-router-dom'
import { InviteBandmateButton } from '@/components/board/InviteBandmateButton'
import { SyncAuthButton } from '@/components/auth/SyncAuthButton'
import { SyncStatusBadge } from '@/components/layout/SyncStatusBadge'
import { FeedbackBadge } from '@/components/layout/FeedbackBadge'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ThemeToggle } from '@/components/board/ThemeToggle'
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
import { BoardSwitcher } from '@/components/board/BoardSwitcher'
import { useUiStore } from '@/stores/uiStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useAudioImport } from '@/hooks/useAudioImport'
import { useGlobalFileDrop } from '@/hooks/useGlobalFileDrop'
import type { DropRejectReason } from '@/lib/extract-audio-files'
import { OnboardingTour } from '@/components/board/OnboardingTour'
import { ImportErrorToast } from '@/components/import/ImportErrorToast'
import { HelpButton } from '@/components/board/HelpButton'
import { cn } from '@/lib/cn'
import '@/styles/board.css'
import { Wordmark } from '@/components/ui/Wordmark'

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
          // B6 done-state copy: the nudge to rename lands at the exact moment
          // you still remember which recording was which.
          setImportSuccess(
            imported === 1
              ? '1 song in your Inbox. Give it a name while you remember which one it is.'
              : `${imported} songs in your Inbox. Give the good ones a name while you remember which is which.`,
          )
        }
        if (duplicates.length > 0) {
          setImportError(
            duplicates.length === 1
              ? `Already imported: ${duplicates[0]}`
              : `${duplicates.length} files already imported, skipped`,
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
      <HelpButton />
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
      <AppShell chromeless>
        <div className="board-page">
          <div className="board-workspace">
            <BoardFrame>
              <div className="board-titlebar">
                {/* The macOS traffic lights belong on the landing-page mockup,
                    where they signal "this is a screenshot of an app". Inside
                    the real app they are a window drawn inside a window. */}
                {/* Merged bar: the shell header used to sit above this,
                    costing ~60px of board height to show a logo twice. */}
                <Link to="/app" className="board-titlebar-logo">
                  <Wordmark />
                </Link>
                <BoardProjectAccent />
                <div className="board-titlebar-actions">
                  <BoardModeToggle />
                  <BoardSearch />
                  <BoardSwitcher />
                  <ProjectSwitcher readOnly={readOnly} />
                  <BoardFilters readOnly={readOnly} />
                  {boardMode === 'manage' && !readOnly && (
                    <>
                      <BoardSelectToggle />
                      <AddSectionButton />
                    </>
                  )}
                  <span className="board-titlebar-spacer" />
                  <InviteBandmateButton />
                  <ThemeToggle />
                  <SettingsPanel />
                  <SyncAuthButton />
                  <FeedbackBadge />
                  <SyncStatusBadge />
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
