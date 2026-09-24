import { useLiveQuery } from 'dexie-react-hooks'
import { getImportWatermark } from '@/db/repositories/integrityRepo'

function clock(ms: number) {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Where you got up to. songdrafts remembers the newest recording it holds, by
 * name, length and the date and time it was recorded, so you can find that
 * spot in Voice Memos and bring in only what is newer. Nothing is ever taken
 * out of Voice Memos.
 */
export function LastImportCard() {
  const watermark = useLiveQuery(() => getImportWatermark(), [])
  if (!watermark) return null

  const when = new Date(watermark.recordedAt)
  const day = when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="import-watermark">
      <span className="import-watermark-label">The last one you brought in</span>
      <strong className="import-watermark-date">
        &ldquo;{watermark.title}&rdquo;{watermark.durationMs ? `, ${clock(watermark.durationMs)}` : ''}
      </strong>
      <span className="import-watermark-sub">
        Recorded {day} at {time}. Find it in Voice Memos and start with anything newer. {watermark.totalSongs}{' '}
        {watermark.totalSongs === 1 ? 'song' : 'songs'} in here so far.
      </span>
    </div>
  )
}
