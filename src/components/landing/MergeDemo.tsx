/**
 * B7. Merge is the one row in the comparison table where every competitor
 * scores a cross, and it was described in two paragraphs with the right half
 * of the section empty. The reader had to imagine the interaction.
 *
 * Three beats on a loop: two cards apart, one travelling onto the other, one
 * card with both takes stacked. Pure CSS keyframes on a handful of divs, so
 * it costs nothing against the page's size budget and there is no library.
 * Hidden from assistive tech and frozen by prefers-reduced-motion, which the
 * stylesheet handles.
 */
export function MergeDemo() {
  return (
    <div className="merge-demo" aria-hidden="true">
      <div className="md-card md-card--target">
        <div className="md-row">
          <span className="md-play">▶</span>
          <span className="md-title">the kettle song</span>
          <span className="md-time">2:14</span>
        </div>
        <div className="md-wave">
          {[38, 62, 45, 80, 30, 70, 52, 88, 41, 66, 35, 74].map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="md-takes">
          <span className="md-take">Take 1</span>
          <span className="md-take md-take--new">Take 2</span>
        </div>
      </div>

      <div className="md-card md-card--travel">
        <div className="md-row">
          <span className="md-play">▶</span>
          <span className="md-title">verse, March</span>
          <span className="md-time">1:07</span>
        </div>
        <div className="md-wave">
          {[52, 34, 70, 44, 84, 38, 60, 48, 76, 32, 58, 42].map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <span className="md-caption">One song, both takes.</span>
    </div>
  )
}
