import { Link } from 'react-router-dom'
import { InviteBandmateButton } from '@/components/board/InviteBandmateButton'
import { SyncAuthButton } from '@/components/auth/SyncAuthButton'
import { OfflineGraceBanner } from './OfflineGraceBanner'
import { CollaboratorBanner } from './CollaboratorBanner'
import { PwaInstallBanner } from './PwaInstallBanner'
import { BoardSwitcher } from '@/components/board/BoardSwitcher'
import { SyncStatusBadge } from './SyncStatusBadge'
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
          mem<span>•</span>
        </Link>
        <div className="app-header-actions">
          <BoardSwitcher />
          <InviteBandmateButton />
          <SettingsPanel />
          <SyncAuthButton />
          <SyncStatusBadge />
        </div>
      </header>
      <OfflineGraceBanner />
      <PwaInstallBanner />
      <CollaboratorBanner />
      <main className="app-main">{children}</main>
      <KeyboardShortcutsHelp />
    </div>
  )
}
