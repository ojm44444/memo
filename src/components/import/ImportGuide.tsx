import { useLiveQuery } from 'dexie-react-hooks'
import { getImportWatermark } from '@/db/repositories/integrityRepo'
import { ImportGuide as Routes } from '@/components/onboarding/ImportGuide'

/**
 * The empty board's welcome. The routes themselves live in one place
 * (onboarding/ImportGuide) so this, the tour, Help, Settings and the emails
 * cannot disagree. This adds the headline and, once there is something to
 * resume from, how far the last import got.
 */

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ImportGuide() {
  const watermark = useLiveQuery(() => getImportWatermark(), [])

  return (
    <div className="import-guide">
      <div className="import-guide-head">
        <h2 className="import-guide-title">Bring the pile in.</h2>
        <p className="import-guide-lead">Pick where your recordings are and follow the steps.</p>
      </div>

      {watermark && (
        <div className="import-watermark">
          <span className="import-watermark-label">You got up to</span>
          <strong className="import-watermark-date">{formatDay(watermark.recordedAt)}</strong>
          <span className="import-watermark-sub">
            Newest recording in here is &ldquo;{watermark.title}&rdquo;, {watermark.totalSongs}{' '}
            {watermark.totalSongs === 1 ? 'song' : 'songs'} in total. Anything you recorded after
            that date is still only on your phone, so start there next time.
          </span>
        </div>
      )}

      <Routes />
    </div>
  )
}
