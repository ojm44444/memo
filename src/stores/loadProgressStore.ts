import { create } from 'zustand'

/**
 * How far along the playing track is in arriving from the cloud.
 *
 * 18 Sept, Owen: "Songs load slow on Listen. Never know when they will show
 * up." ColumnPlayerBar owns the one audio element, so it fills this in from
 * the element's own events; the Listen row and the player bar read it.
 *
 * `versionId` is set only while a cloud take is loading (before it can play,
 * or when it runs dry mid-song). A take already on this device starts in
 * tens of milliseconds and never shows up here, so nothing flickers.
 * `fraction` is how much of the file the browser holds (0 to 1), or null
 * until the length is known.
 */
interface LoadProgressState {
  versionId: string | null
  fraction: number | null
  start: (versionId: string) => void
  update: (versionId: string, fraction: number) => void
  done: (versionId?: string | null) => void
}

export const useLoadProgress = create<LoadProgressState>((set, get) => ({
  versionId: null,
  fraction: null,
  start: (versionId) => {
    if (get().versionId === versionId) return
    set({ versionId, fraction: null })
  },
  update: (versionId, fraction) => {
    if (get().versionId !== versionId) return
    const clamped = Math.max(0, Math.min(1, fraction))
    if (clamped === get().fraction) return
    set({ fraction: clamped })
  },
  done: (versionId) => {
    const current = get().versionId
    if (!current) return
    if (versionId && versionId !== current) return
    set({ versionId: null, fraction: null })
  },
}))

/** "Loading 42%" when the size is known, otherwise "Loading…". */
export function loadingLabel(fraction: number | null): string {
  if (fraction == null) return 'Loading…'
  return `Loading ${Math.floor(fraction * 100)}%`
}

/**
 * True while a cloud take is being fetched for playback. The background
 * offline downloads wait for it rather than splitting the connection with
 * the song someone is waiting to hear.
 */
export function isPlaybackLoading(): boolean {
  return useLoadProgress.getState().versionId != null
}
