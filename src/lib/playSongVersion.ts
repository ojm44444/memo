import { usePlayerStore } from '@/stores/playerStore'
import type { ColumnSlug } from '@/types/column'

export async function playSongVersion(
  columnSlug: ColumnSlug,
  songId: string,
  versionId: string,
) {
  await usePlayerStore.getState().playAtVersion(columnSlug, songId, versionId)
}

export async function playSongAtTimestamp(
  columnSlug: ColumnSlug,
  songId: string,
  versionId: string,
  timestampMs: number,
) {
  await usePlayerStore.getState().playSongAtTimestamp(columnSlug, songId, versionId, timestampMs)
}
