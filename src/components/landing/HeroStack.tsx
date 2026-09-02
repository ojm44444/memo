/**
 * B10. The hero used the left two-thirds and left roughly 500px empty to its
 * right, so the composition changed shape halfway down the page when the
 * full-width board arrived underneath.
 *
 * One song with three takes stacked on it: the single idea the whole product
 * rests on, shown above the fold, filling the space that was doing nothing.
 */
export function HeroStack() {
  return (
    <div className="hero-stack" aria-hidden="true">
      <div className="hs-card">
        <div className="hs-head">
          <span className="hs-play">▶</span>
          <span className="hs-title">the kettle song</span>
        </div>
        <div className="hs-meta">
          <span className="hs-tag">chorus</span>
          <span className="hs-key">Am · 92</span>
        </div>
        <div className="hs-takes">
          {[
            ['Take 3', 'today', true],
            ['Take 2', 'last week', false],
            ['Take 1', 'March', false],
          ].map(([label, when, live]) => (
            <div key={label as string} className={`hs-take${live ? ' is-live' : ''}`}>
              <span className="hs-take-label">{label}</span>
              <span className="hs-take-wave">
                {[30, 58, 42, 70, 36, 64, 48, 76, 40, 54].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </span>
              <span className="hs-take-when">{when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
