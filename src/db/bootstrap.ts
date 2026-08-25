import { db } from './database'
import { ensureSeeded } from './seed'
import { backfillSongTitlesFromVersionLabels } from './migrations/backfillSongTitlesFromVersionLabels'

/**
 * Open IndexedDB and run startup migrations/seeding.
 *
 * Kept in its own module and imported dynamically so that Dexie, the
 * repositories and the migrations do not land in the entry chunk. A visitor
 * reading the landing page has no database to open, and used to download
 * ~31 KB gzipped of Dexie plus boardRepo before the headline painted.
 *
 * Resolves even on failure: a broken database should not block rendering,
 * it should surface through the UI.
 */
export async function bootstrapDatabase(): Promise<void> {
  try {
    // Await the open so useLiveQuery in components never fires against a
    // half-open database.
    await db.open()
  } catch (err) {
    console.error('[songdrafts] DB failed to open:', err)
    return
  }

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
}
