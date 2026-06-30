import { db } from '@/db/database'
import type { AudioMarker } from '@/types/audio-marker'
import { createId } from '@/lib/ids'

export async function getMarkersForVersion(versionId: string) {
  return db.audioMarkers.where('versionId').equals(versionId).sortBy('ms')
}

export async function addMarker(
  versionId: string,
  ms: number,
  label = '',
  type: AudioMarker['type'] = 'marker',
) {
  const marker: AudioMarker = { id: createId(), versionId, ms, label, type }
  await db.audioMarkers.put(marker)
  return marker
}

export async function updateMarker(
  id: string,
  patch: Partial<Pick<AudioMarker, 'ms' | 'label' | 'type'>>,
) {
  await db.audioMarkers.update(id, patch)
}

export async function deleteMarker(id: string) {
  await db.audioMarkers.delete(id)
}
