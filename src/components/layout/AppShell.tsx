import { Link } from 'react-router-dom'
import { InviteBandmateButton } from '@/components/board/InviteBandmateButton'
import { SyncAuthButton } from '@/components/auth/SyncAuthButton'
import { OfflineGraceBanner } from './OfflineGraceBanner'
import { CollaboratorBanner } from './CollaboratorBanner'
import { BoardSwitcher } from '@/components/board/BoardSwitcher'
import { SyncStatusBadge } from './SyncStatusBadge'
import { FeedbackBadge } from './FeedbackBadge'
import { KeyboardShortcutsHelp } from '@/components/board/KeyboardShortcutsHelp'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/app" className="app-header-logo">
          mem<span>o</span>
        </Link>
        <div className="app-header-actions">
          <BoardSwitcher />
          <InviteBandmateButton />
          <SettingsPanel />
          <SyncAuthButton />
          <FeedbackBadge />
          <SyncStatusBadge />
        </div>
      </header>
      <OfflineGraceBanner />
      <CollaboratorBanner />
      <main className="app-main">{children}</main>
      <KeyboardShortcutsHelp />
    </div>
  )
}
