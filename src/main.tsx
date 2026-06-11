import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ensureSeeded } from '@/db/seed'
import { initPwa } from '@/lib/pwa/register'
import '@/styles/globals.css'

void ensureSeeded()
initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
