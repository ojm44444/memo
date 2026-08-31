import { Suspense, lazy } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PwaInstallBanner } from '@/components/layout/PwaInstallBanner'
import { PwaUpdateBanner } from '@/components/layout/PwaUpdateBanner'
import { LandingPage } from '@/pages/LandingPage'

/**
 * Only the landing page is eager. Everything else is a separate chunk so a
 * visitor arriving from an ad does not download the board, and with it
 * wavesurfer, dnd-kit, Dexie, Supabase and music-metadata, before the
 * headline paints.
 *
 * Each of these pages imports its own stylesheet, so splitting the route
 * splits the CSS with it. board.css alone is 172 KB of source.
 */
const BoardPage = lazy(() =>
  import('@/pages/BoardPage').then((m) => ({ default: m.BoardPage })),
)
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const PrivacyPage = lazy(() =>
  import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const TermsPage = lazy(() =>
  import('@/pages/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const SignInPage = lazy(() =>
  import('@/pages/SignInPage').then((m) => ({ default: m.SignInPage })),
)
const SharePage = lazy(() =>
  import('@/pages/SharePage').then((m) => ({ default: m.SharePage })),
)
const PlaylistSharePage = lazy(() =>
  import('@/pages/PlaylistSharePage').then((m) => ({ default: m.PlaylistSharePage })),
)
const InvitePage = lazy(() =>
  import('@/pages/InvitePage').then((m) => ({ default: m.InvitePage })),
)

/**
 * Deliberately blank. These chunks resolve in tens of milliseconds on a warm
 * connection, and a spinner that flashes for 40ms reads as jank rather than
 * progress. The board renders its own loading state once mounted.
 */
function RouteFallback() {
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <PwaInstallBanner />
      <PwaUpdateBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="sign-in" element={<SignInPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="app/*" element={<BoardPage />} />
          {/* Owner-only. Gated SERVER side by is_owner() and RLS, not by
              hiding the route: anyone can visit, nobody else sees numbers. */}
          <Route path="admin" element={<AdminPage />} />
          <Route path="invite/:token" element={<InvitePage />} />
          <Route path="share/:token" element={<SharePage />} />
          <Route path="playlist/:token" element={<PlaylistSharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  )
}
