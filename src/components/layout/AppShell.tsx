import { Link } from 'react-router-dom'
import { InviteBandmateButton } from '@/components/board/InviteBandmateButton'
import { SyncAuthButton } from '@/components/auth/SyncAuthButton'
import { OfflineGraceBanner } from './OfflineGraceBanner'
import { CollaboratorBanner } from './CollaboratorBanner'
import { SyncStatusBadge } from './SyncStatusBadge'
import { FeedbackBadge } from './FeedbackBadge'
import { KeyboardShortcutsHelp } from '@/components/board/KeyboardShortcutsHelp'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ThemeToggle } from '@/components/board/ThemeToggle'
import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  /**
   * The board is the page, not a widget on one. When it supplies its own
   * single merged bar, the shell's header would be a second row of chrome
   * costing ~60px of board height for no added function.
   */
  chromeless?: boolean
}

export function AppShell({ children, chromeless = false }: AppShellProps) {
  return (
    <div className={chromeless ? 'app-shell app-shell--chromeless' : 'app-shell'}>
      {!chromeless && <header className="app-header">
        <Link to="/app" className="app-header-logo">
          s<span>o</span>ngdrafts
        </Link>
        <div className="app-header-actions">
          <InviteBandmateButton />
          <ThemeToggle />
          <SettingsPanel />
          <SyncAuthButton />
          <FeedbackBadge />
          <SyncStatusBadge />
        </div>
      </header>}
      <OfflineGraceBanner />
      <CollaboratorBanner />
      <main className="app-main">{children}</main>
      <KeyboardShortcutsHelp />
    </div>
  )
}
