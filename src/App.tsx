import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PwaUpdateBanner } from '@/components/layout/PwaUpdateBanner'
import { BoardPage } from '@/pages/BoardPage'
import { InvitePage } from '@/pages/InvitePage'
import { LandingPage } from '@/pages/LandingPage'
import { SharePage } from '@/pages/SharePage'
import { SignInPage } from '@/pages/SignInPage'

export default function App() {
  return (
    <BrowserRouter>
      <PwaUpdateBanner />
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="app/*" element={<BoardPage />} />
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="share/:token" element={<SharePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
