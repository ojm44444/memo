import { db } from '@/db/database'

const PREFIX = 'playbackPos:'

export async function getPlaybackPositionMs(songId: string): Promise<number> {
  const meta = await db.syncMeta.get(`${PREFIX}${songId}`)
  if (!meta?.value) return 0
  const ms = Number(meta.value)
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

export async function setPlaybackPositionMs(songId: string, ms: number) {
  if (!songId || ms < 1) return
  await db.syncMeta.put({ key: `${PREFIX}${songId}`, value: String(Math.round(ms)) })
}

export async function clearPlaybackPositionMs(songId: string) {
  await db.syncMeta.delete(`${PREFIX}${songId}`)
}
