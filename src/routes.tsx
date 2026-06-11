import { createBrowserRouter } from 'react-router-dom'
import { LandingPage } from '@/pages/LandingPage'
import { BoardPage } from '@/pages/BoardPage'

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/app', element: <BoardPage /> },
  { path: '/app/import', element: <BoardPage /> },
])
