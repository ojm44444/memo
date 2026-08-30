import { useLiveQuery } from 'dexie-react-hooks'
import { getImportWatermark } from '@/db/repositories/integrityRepo'

/**
 * The import screen, said honestly.
 *
 * Owen's brief: a proper welcome that explains the routes, admits the first
 * pass is manual, states where it is going, and - the part that makes the
 * manual bit survivable - tells you how far you got last time so you know
 * where to start again.
 *
 * The honesty here is not decoration. This audience punishes vagueness, and
 * the thing they will hit within five minutes is that importing is fiddly. Say
 * it first, in our own words, rather than letting them discover it.
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
        <p className="import-guide-lead">
          There are three ways in. None of them is one tap yet, and it is worth knowing why
          before you start.
        </p>
      </div>

      {/* The watermark. Only appears once there is something to resume from. */}
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

      <div className="import-routes">
        <div className="import-route" style={{ ['--route' as string]: 'var(--stage-inbox)' }}>
          <div className="import-route-icon" aria-hidden>▤</div>
          <h3>On a Mac</h3>
          <p>
            Link your Voice Memos folder once and everything synced to this Mac comes across,
            plus new recordings after that.
          </p>
          <p className="import-route-caveat">
            Worth knowing: memos still in iCloud and not downloaded to this Mac will not be in
            the folder, so a link can look like it missed some. Open Voice Memos on the Mac and
            let it finish downloading first.
          </p>
        </div>

        <div className="import-route" style={{ ['--route' as string]: 'var(--stage-ideas)' }}>
          <div className="import-route-icon" aria-hidden>▣</div>
          <h3>On your iPhone</h3>
          <p>
            In Voice Memos, select the recordings you want, tap Save to Files, then import them
            here in one go. Multi-select works, so a big batch is one trip.
          </p>
          <p className="import-route-caveat">
            No app can read the Voice Memos library directly. Not us, not anyone on the App
            Store: Apple does not allow it. This is the honest route.
          </p>
        </div>

        <div className="import-route" style={{ ['--route' as string]: 'var(--stage-half)' }}>
          <div className="import-route-icon" aria-hidden>▧</div>
          <h3>From anywhere else</h3>
          <p>
            Drag audio straight onto the board from Finder, a DAW bounce folder, or a download.
            It lands in Inbox.
          </p>
        </div>
      </div>

      <div className="import-phone">
        <h3>Using it on your phone</h3>
        <p>
          The board is built for a proper screen: dragging songs between sections wants a mouse
          or a big display. On a phone what you actually want is to listen back to what you have
          got, and that works well.
        </p>
        <p>
          Add it to your home screen and it opens like an app, full screen, and works with no
          signal. On an iPhone: open songdrafts in Safari, tap <strong>Share</strong>, then{' '}
          <strong>Add to Home Screen</strong>. On Android, Chrome offers to install it.
        </p>
        <p className="import-phone-note">
          You do not need anything from the App Store to use songdrafts, and there is no separate
          app to buy. It runs in the browser, and your account is the same everywhere.
        </p>
      </div>

      <div className="import-vision">
        <h3>Where this is going</h3>
        <p>
          The first pass is the big one. After that it is upkeep: a handful of new memos
          whenever you think of it, starting from the date above. The goal is to make that
          automatic, and there is no point pretending it already is.
        </p>
      </div>
    </div>
  )
}
