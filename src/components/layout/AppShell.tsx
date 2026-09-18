import { OfflineGraceBanner } from './OfflineGraceBanner'
import { CollaboratorBanner } from './CollaboratorBanner'
import { KeyboardShortcutsHelp } from '@/components/board/KeyboardShortcutsHelp'
import type { ReactNode } from 'react'

/**
 * The board is the page, not a widget on one: it supplies its own single
 * merged titlebar, so this shell never renders a header of its own (that
 * used to exist for other routes, but nothing else has mounted this
 * non-chromeless in a long time, and keeping a second, unused header system
 * around just to maintain was a bigger cost than deleting it).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell app-shell--chromeless">
      <OfflineGraceBanner />
      <CollaboratorBanner />
      <main className="app-main">{children}</main>
      <KeyboardShortcutsHelp />
    </div>
  )
}
