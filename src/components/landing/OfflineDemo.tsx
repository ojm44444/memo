/**
 * B11. Was a bare rounded box with signal bars, the words NO SIGNAL and an
 * unexplained solid green rectangle that read as a loading state or a
 * rendering fault.
 *
 * The claim is "it still works with no signal", so show it working: a phone
 * with the signal cut, a song playing, a progress bar actually moving, and
 * the queued-sync marker. Same CSS-only rule as the merge demo.
 */
export function OfflineDemo() {
  return (
    <div className="offline-demo" aria-hidden="true">
      <div className="od-phone">
        <div className="od-status">
          <span className="od-bars od-bars--off">
            <i /><i /><i /><i />
          </span>
          <span className="od-nosignal">No signal</span>
          <span className="od-battery" />
        </div>

        <div className="od-card">
          <div className="od-card-top">
            <span className="od-play">❚❚</span>
            <span className="od-title">car park chorus</span>
          </div>
          <div className="od-wave">
            {[40, 66, 48, 82, 34, 72, 56, 90, 44, 68, 38, 76, 50, 62].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
            <span className="od-playhead" />
          </div>
          <div className="od-progress"><span /></div>
        </div>

        <div className="od-queued">
          <span className="od-dot" />
          Saved here. Syncs when you&apos;re back.
        </div>
      </div>
    </div>
  )
}
