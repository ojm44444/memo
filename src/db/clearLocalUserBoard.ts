import { ensureSeeded } from '@/db/seed'
import { db } from './database'

/** Wipe this device's board so signed-out users cannot see the previous account's memos. */
export async function clearLocalUserBoard() {
  await db.transaction(
    'rw',
    [
      db.songs,
      db.audioVersions,
      db.audioBlobs,
      db.songLinks,
      db.songComments,
      db.syncQueue,
      db.columns,
      db.projects,
      db.syncMeta,
      db.importedSources,
      db.folderWatch,
    ],
    async () => {
      const deviceId = (await db.syncMeta.get('deviceId'))?.value

      await Promise.all([
        db.songs.clear(),
        db.audioVersions.clear(),
        db.audioBlobs.clear(),
        db.songLinks.clear(),
        db.songComments.clear(),
        db.syncQueue.clear(),
        db.columns.clear(),
        db.projects.clear(),
        db.importedSources.clear(),
        db.folderWatch.clear(),
        db.syncMeta.clear(),
      ])

      if (deviceId) {
        await db.syncMeta.put({ key: 'deviceId', value: deviceId })
      }
      await db.syncMeta.put({ key: 'lastPulledAt', value: new Date(0).toISOString() })
    },
  )

  await ensureSeeded()
}
