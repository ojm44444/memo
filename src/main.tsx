import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ensureSeeded } from '@/db/seed'
import { initPwa } from '@/lib/pwa/register'
import { installAudioUnlock } from '@/lib/audio/globalAudioEl'
import '@/styles/globals.css'

void ensureSeeded()
initPwa()
installAudioUnlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
