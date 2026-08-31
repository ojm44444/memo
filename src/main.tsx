import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { installAudioUnlock } from '@/lib/audio/globalAudioEl'
import { redirectAuthCallbackToBoard } from '@/lib/auth/authLanding'
import '@/styles/globals.css'

installAudioUnlock()

/**
 * Service worker registration is deferred off the critical path. It pulls in
 * workbox and has nothing to do with first paint, so it waits for idle rather
 * than sitting in the entry chunk.
 */
function schedulePwaInit() {
  const run = () => void import('@/lib/pwa/register').then((m) => m.initPwa())
  if ('requestIdleCallback' in window) {
    ;(window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run)
  } else {
    setTimeout(run, 1500)
  }
}

const root = createRoot(document.getElementById('root')!)

function render() {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

/**
 * The landing page never touches IndexedDB, so it renders immediately and the
 * database module (Dexie + repositories + migrations) stays out of the entry
 * chunk entirely.
 *
 * Every other route waits for the database to finish opening before the first
 * render, so useLiveQuery never runs against a half-open database.
 */
/**
 * Before anything else: a completed sign-in that landed on `/` belongs on the
 * board. This has to happen ahead of the render branch below, because the
 * landing route never loads the Supabase client and so would strand the code
 * in the URL. See lib/auth/authLanding.ts.
 */
if (!redirectAuthCallbackToBoard()) {
  const isLandingRoute = window.location.pathname === '/'

  schedulePwaInit()

  if (isLandingRoute) {
    render()
  } else {
    void import('@/db/bootstrap')
      .then(({ bootstrapDatabase }) => bootstrapDatabase())
      .finally(render)
  }
}
