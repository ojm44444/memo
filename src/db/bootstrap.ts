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

  // Import integrity. Silent orphan cards are the failure mode that makes
  // someone think their music is gone, so they get named in the console rather
  // than sitting there quietly. Never blocks boot.
  void import('@/db/repositories/integrityRepo').then(async ({ runIntegrityCheck }) => {
    try {
      const report = await runIntegrityCheck()
      if (report.songsWithoutTakes.length) {
        console.warn(
          `[songdrafts] ${report.songsWithoutTakes.length} card(s) have no take:`,
          report.songsWithoutTakes.map((s) => s.title),
        )
      }
      if (report.unrecoverableVersions.length) {
        console.error(
          `[songdrafts] ${report.unrecoverableVersions.length} take(s) have no bytes on this device OR in the cloud:`,
          report.unrecoverableVersions.map((v) => v.label),
        )
      }
    } catch (err) {
      console.error('[songdrafts] integrity check failed:', err)
    }
  })

  // The trash's stated window has to be enforced somewhere or it is a lie:
  // anything soft-deleted more than 30 days ago goes for good on boot.
  void import('@/db/repositories/trashRepo').then(({ purgeExpiredTrash }) =>
    purgeExpiredTrash().catch((err) =>
      console.error('[songdrafts] trash purge failed:', err),
    ),
  )

  // The import reminder, if one is owed.
  //
  // Fires on boot rather than on a timer, because a web app with no server
  // cannot wake itself on a Sunday evening. This is a catch-up: you opened the
  // app, a slot has passed, here is where you got up to. The settings copy
  // says exactly that rather than implying an alarm clock.
  void import('@/lib/reminders').then(({ fireReminderIfDue }) =>
    fireReminderIfDue().catch((err) =>
      console.error('[songdrafts] reminder check failed:', err),
    ),
  )

  // Dev-only: seed a demo board when the auth bypass is active (UI testing).
  if (import.meta.env.DEV) {
    const { isDevAuthBypass, isShotMode } = await import('@/lib/auth/devBypass')
    if (isDevAuthBypass()) {
      const { seedDevDemo } = await import('@/db/devSeed')
      await seedDevDemo()

      /**
       * Marketing-screenshot dressing (?shot=1).
       *
       * Puts one card into the playing state so the shot shows the single
       * accent element the identity calls for. Sets store state directly
       * rather than actually playing, because headless Chrome blocks audio
       * and we only need the visual state.
       */
      if (isShotMode()) {
        // Dark is the identity, and the shot is a marketing asset, so it does
        // not follow the OS. Written to storage rather than toggling the class,
        // because useTheme mounts afterwards and would re-apply the OS choice
        // (headless Chrome reports light).
        try {
          localStorage.setItem('memo-theme', 'dark')
        } catch {}
        document.documentElement.classList.remove('light')
        document.documentElement.setAttribute('data-shot', '1')
        // The tour is correct behaviour for a first-run user and wrong for a
        // product shot; it covered the board entirely.
        const { setOnboardingTourComplete } = await import('@/lib/onboarding')
        await setOnboardingTourComplete()

        const song = await db.songs.filter((s) => s.title === 'Poem').first()
        const version = song
          ? await db.audioVersions.where('songId').equals(song.id).first()
          : undefined
        if (song && version) {
          const { usePlayerStore } = await import('@/stores/playerStore')
          usePlayerStore.setState({
            currentSongId: song.id,
            currentVersionId: version.id,
            isPlaying: true,
            progress: 0.42,
          })
        }
      }
    }
  }
}
