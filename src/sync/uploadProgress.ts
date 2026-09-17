import { useSyncExternalStore } from 'react'

/**
 * How far each audio upload has got, so the app can say "Uploading 43%"
 * instead of "Uploading" forever (17 Sept, Owen: a four minute song sat on
 * "Uploading" for five minutes and he did not believe it).
 */
export type UploadState = { fraction: number; failed: string | null }

const progress = new Map<string, UploadState>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setUploadProgress(versionId: string, fraction: number) {
  progress.set(versionId, { fraction: Math.max(0, Math.min(1, fraction)), failed: null })
  emit()
}

export function setUploadFailed(versionId: string, message: string) {
  const prev = progress.get(versionId)
  progress.set(versionId, { fraction: prev?.fraction ?? 0, failed: message })
  emit()
}

export function clearUploadProgress(versionId: string) {
  if (progress.delete(versionId)) emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUploadProgress(versionId: string | null | undefined): UploadState | null {
  return useSyncExternalStore(subscribe, () => (versionId ? (progress.get(versionId) ?? null) : null))
}
