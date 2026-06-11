import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { formatDuration } from '@/lib/audio-utils'
import { playSongAtTimestamp } from '@/lib/playSongVersion'
import { getSong } from '@/db/repositories/boardRepo'
import { usePlayerStore } from '@/stores/playerStore'

interface VersionCompareProps {
  songId: string
}

export function VersionCompare({ songId }: VersionCompareProps) {
  const versions = useLiveQuery(
    () => db.audioVersions.where('songId').equals(songId).sortBy('sortOrder'),
    [songId],
  )
  const song = useLiveQuery(() => getSong(songId), [songId])
  const { currentVersionId, progress } = usePlayerStore()
  const [slotA, setSlotA] = useState(0)
  const [slotB, setSlotB] = useState(1)
  const [activeSlot, setActiveSlot] = useState<'a' | 'b'>('a')

  if (!versions || versions.length < 2 || !song) return null

  const versionA = versions[Math.min(slotA, versions.length - 1)]
  const versionB = versions[Math.min(slotB, versions.length - 1)]

  const currentTimestampMs = () => {
    const playing = versions.find((version) => version.id === currentVersionId)
    if (!playing) return 0
    return Math.max(0, progress * playing.durationMs)
  }

  const playSlot = async (slot: 'a' | 'b', atMs?: number) => {
    const version = slot === 'a' ? versionA : versionB
    setActiveSlot(slot)
    const timestampMs = atMs ?? currentTimestampMs()
    await playSongAtTimestamp(song.columnSlug, songId, version.id, timestampMs)
  }

  const flip = async () => {
    const next = activeSlot === 'a' ? 'b' : 'a'
    await playSlot(next, currentTimestampMs())
  }

  return (
    <div className="version-compare">
      <div className="version-compare-header">
        <span className="song-detail-label">Compare versions</span>
        <button type="button" className="version-compare-flip" onClick={() => void flip()}>
          Flip at {formatDuration(currentTimestampMs())}
        </button>
      </div>

      <div className="version-compare-slots">
        <label className="version-compare-slot">
          <span className="version-compare-slot-label">A</span>
          <select
            className="version-compare-select"
            value={slotA}
            onChange={(e) => setSlotA(Number(e.target.value))}
          >
            {versions.map((v, i) => (
              <option key={v.id} value={i}>
                {v.label || `Take ${i + 1}`} ({formatDuration(v.durationMs)})
              </option>
            ))}
          </select>
          <button
            type="button"
            className={activeSlot === 'a' ? 'version-compare-play is-active' : 'version-compare-play'}
            onClick={() => void playSlot('a')}
          >
            Play A
          </button>
        </label>

        <label className="version-compare-slot">
          <span className="version-compare-slot-label">B</span>
          <select
            className="version-compare-select"
            value={slotB}
            onChange={(e) => setSlotB(Number(e.target.value))}
          >
            {versions.map((v, i) => (
              <option key={v.id} value={i}>
                {v.label || `Take ${i + 1}`} ({formatDuration(v.durationMs)})
              </option>
            ))}
          </select>
          <button
            type="button"
            className={activeSlot === 'b' ? 'version-compare-play is-active' : 'version-compare-play'}
            onClick={() => void playSlot('b')}
          >
            Play B
          </button>
        </label>
      </div>
    </div>
  )
}
