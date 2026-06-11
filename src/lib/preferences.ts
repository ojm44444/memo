import type { PlaybackRate } from '@/lib/constants'
import { db } from '@/db/database'

export type LoopMode = 'off' | 'section' | 'board'

const DEFAULT_PLAYBACK_RATE_KEY = 'defaultPlaybackRate'
const LOOP_MODE_KEY = 'loopMode'

const LOOP_MODES: LoopMode[] = ['off', 'section', 'board']

export async function getDefaultPlaybackRate(): Promise<PlaybackRate> {
  const meta = await db.syncMeta.get(DEFAULT_PLAYBACK_RATE_KEY)
  const value = Number(meta?.value)
  if (value === 1 || value === 1.5 || value === 2) return value
  return 1
}

export async function setDefaultPlaybackRate(rate: PlaybackRate) {
  await db.syncMeta.put({ key: DEFAULT_PLAYBACK_RATE_KEY, value: String(rate) })
}

export async function getLoopMode(): Promise<LoopMode> {
  const meta = await db.syncMeta.get(LOOP_MODE_KEY)
  if (meta && LOOP_MODES.includes(meta.value as LoopMode)) return meta.value as LoopMode
  return 'off'
}

export async function setLoopMode(mode: LoopMode) {
  await db.syncMeta.put({ key: LOOP_MODE_KEY, value: mode })
}

export function nextLoopMode(mode: LoopMode): LoopMode {
  const index = LOOP_MODES.indexOf(mode)
  return LOOP_MODES[(index + 1) % LOOP_MODES.length]
}
