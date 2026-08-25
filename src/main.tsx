import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { db } from '@/db/database'
import { ensureSeeded } from '@/db/seed'
import { initPwa } from '@/lib/pwa/register'
import { installAudioUnlock } from '@/lib/audio/globalAudioEl'
import { backfillSongTitlesFromVersionLabels } from '@/db/migrations/backfillSongTitlesFromVersionLabels'
import '@/styles/globals.css'

initPwa()
installAudioUnlock()

const root = createRoot(document.getElementById('root')!)

// Wait for Dexie to finish opening/upgrading before rendering so useLiveQuery
// calls inside components never fire against a half-open database.
db.open()
  .then(async () => {
    await ensureSeeded()
    void backfillSongTitlesFromVersionLabels()
    // Dev-only: seed a demo board when the auth bypass is active (UI testing).
    if (import.meta.env.DEV) {
      const { isDevAuthBypass } = await import('@/lib/auth/devBypass')
      if (isDevAuthBypass()) {
        const { seedDevDemo } = await import('@/db/devSeed')
        await seedDevDemo()
      }
    }
  })
  .catch((err) => {
    console.error('[songdrafts] DB failed to open:', err)
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
