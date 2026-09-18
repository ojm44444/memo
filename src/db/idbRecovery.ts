import { db } from './database'

/**
 * Recovering from IndexedDB going away under an installed iPhone app.
 *
 * Owen, 18 Sept, phone PWA: "Something went wrong. Attempt to iterate a
 * cursor that doesn't exist", fixed by pressing Reload. That text is WebKit's
 * IndexedDB backend (SQLiteIDBBackingStore::iterateCursor) failing to find a
 * cursor it was part way through. It is a transient failure of the storage
 * connection, not a problem with the data: a reload, which reopens the
 * database, always cured it.
 *
 * Why it became a full-screen crash is traced: useLiveQuery rethrows a query
 * error during render (dexie-react-hooks useObservable), so ANY live query
 * that hit it took the whole app down to the root ErrorBoundary. What makes
 * WebKit lose the cursor is likely, not proven: iOS suspending the app while
 * a query was mid-iteration (Dexie also closes connections on a persisted
 * pagehide), leaving the connection half dead on resume. The same family
 * includes "Connection to Indexed Database server lost" and a closed database.
 *
 * So: recognise the transient family, reopen the database, and retry, both
 * on resume (before a query trips on it) and in the error boundary (if one
 * did).
 */

const TRANSIENT_NAMES = new Set([
  'UnknownError',
  'InvalidStateError',
  'DatabaseClosedError',
  'TransactionInactiveError',
])

const TRANSIENT_MESSAGE =
  /cursor that (doesn'?t|does not) exist|indexed ?(db|database) server lost|connection is closing|database (has been|was|is) closed|database connection|transaction (has|was) (finished|aborted)|IDBDatabase|IndexedDB/i

export function isTransientIdbError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; current && depth < 4; depth++) {
    const e = current as { name?: unknown; message?: unknown; inner?: unknown }
    const name = typeof e.name === 'string' ? e.name : ''
    const message = typeof e.message === 'string' ? e.message : ''
    if (TRANSIENT_MESSAGE.test(message)) return true
    if (TRANSIENT_NAMES.has(name) && /idb|indexed|cursor|database|transaction|connection/i.test(`${name} ${message}`)) {
      return true
    }
    if (name === 'DatabaseClosedError') return true
    // Dexie wraps the native error as `inner`.
    current = e.inner
  }
  return false
}

let reopening: Promise<boolean> | null = null

/** Close and reopen the connection. Safe to call from several places at once. */
export function reopenDatabase(): Promise<boolean> {
  if (reopening) return reopening
  reopening = (async () => {
    try {
      if (db.isOpen()) db.close({ disableAutoOpen: false })
      await db.open()
      return true
    } catch (err) {
      console.error('[songdrafts] reopening the database failed:', err)
      return false
    } finally {
      // Let the next failure try again rather than reuse this attempt.
      setTimeout(() => {
        reopening = null
      }, 0)
    }
  })()
  return reopening
}

async function probe(): Promise<void> {
  try {
    // A tiny read that walks a cursor-free path. If the connection died while
    // the app was in the background, this is where it shows.
    await db.syncMeta.limit(1).toArray()
  } catch (err) {
    if (isTransientIdbError(err)) {
      console.warn('[songdrafts] database was lost while away, reopening:', err)
      await reopenDatabase()
    }
  }
}

let installed = false

/** Check the connection whenever the app comes back to the foreground. */
export function installIdbResumeGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void probe()
  })
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) void probe()
  })
  // An unhandled transient failure elsewhere (a repository call, the sync
  // loop) also heals the connection for everything after it.
  window.addEventListener('unhandledrejection', (event) => {
    if (isTransientIdbError(event.reason)) void reopenDatabase()
  })
}
