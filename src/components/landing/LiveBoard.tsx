import { useEffect, useMemo, useState } from 'react'

/**
 * The hero board, alive.
 *
 * This replaces a static PNG screenshot. A dead screenshot cannot say "this
 * tool is good" — it says "here is a picture of some software". This renders
 * the real board language (stage ramp, waveform cards, a playing card) and
 * MOVES: waveform bars breathe, a playhead sweeps the playing card, and every
 * few seconds a card lifts out of one column and lands in the next, which is
 * the single gesture the whole product is about.
 *
 * Deliberately not the real app: no audio, no data, no Dexie. It is a stage
 * set, sized and coloured from the same tokens so it can never drift from the
 * identity.
 */

type Card = { id: string; title: string; time: string; tag?: string; bars: number[] }

const seedBars = (seed: number, n = 34) =>
  Array.from({ length: n }, (_, i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    return 0.25 + Math.abs(x - Math.floor(x)) * 0.75
  })

const COLUMNS: { name: string; cards: Card[] }[] = [
  {
    name: 'Ideas',
    cards: [
      { id: 'a', title: 'car park chorus', time: '0:41', tag: 'riff', bars: seedBars(1) },
      { id: 'b', title: 'tuesday rain', time: '1:07', bars: seedBars(2) },
      { id: 'c', title: 'shower bridge??', time: '0:26', bars: seedBars(9) },
    ],
  },
  {
    name: 'Half written',
    cards: [
      { id: 'd', title: 'the kettle song', time: '2:14', tag: 'lyrics drafted', bars: seedBars(3) },
      { id: 'e', title: 'M6 at midnight', time: '3:02', bars: seedBars(4) },
    ],
  },
  {
    name: 'Finished demos',
    cards: [
      { id: 'f', title: 'verse for June', time: '4:18', tag: 'sent to producer', bars: seedBars(5) },
      { id: 'g', title: 'half a hook', time: '1:55', bars: seedBars(8) },
    ],
  },
  {
    name: 'Released',
    cards: [{ id: 'h', title: 'glasgow bridge', time: '3:37', tag: 'released', bars: seedBars(6) }],
  },
]

const STAGE = ['var(--stage-inbox)', 'var(--stage-ideas)', 'var(--stage-half)', 'var(--stage-done)']

function Waveform({ bars, playing, progress }: { bars: number[]; playing?: boolean; progress?: number }) {
  return (
    <div className={`lb-wave${playing ? ' is-playing' : ''}`}>
      {bars.map((h, i) => {
        const played = playing && progress != null && i / bars.length <= progress
        return (
          <span
            key={i}
            className={`lb-bar${played ? ' is-played' : ''}`}
            style={{
              height: `${Math.round(h * 100)}%`,
              animationDelay: playing ? `${(i % 12) * 90}ms` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

export function LiveBoard() {
  const [progress, setProgress] = useState(0)
  const [moved, setMoved] = useState(false)
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // The playhead on the playing card.
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setProgress((p) => (p >= 1 ? 0 : p + 0.006)), 60)
    return () => window.clearInterval(id)
  }, [reduced])

  // The gesture the product is about: a card moving right as it gets better.
  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setMoved((m) => !m), 5200)
    return () => window.clearInterval(id)
  }, [reduced])

  return (
    <div className="lb" aria-hidden="true">
      <div className="lb-glow" />
      <div className="lb-frame">
        <div className="lb-cols">
          {COLUMNS.map((col, ci) => (
            <div className="lb-col" key={col.name} style={{ ['--stage' as string]: STAGE[ci] }}>
              <div className="lb-col-head">
                <span className="lb-col-name">{col.name}</span>
                <span className="lb-col-count">{col.cards.length}</span>
              </div>
              <div className="lb-col-rule" />
              <div className="lb-cards">
                {col.cards.map((card) => {
                  // "shower bridge??" travels from Ideas into Half written.
                  const travels = card.id === 'c'
                  const hideHere = travels && moved && ci === 0
                  const playing = card.id === 'd'
                  return (
                    <div
                      key={card.id}
                      className={[
                        'lb-card',
                        playing ? 'is-playing' : '',
                        travels ? 'is-traveller' : '',
                        hideHere ? 'is-gone' : '',
                      ].join(' ')}
                    >
                      <div className="lb-card-top">
                        <span className="lb-play">{playing ? '❚❚' : '▶'}</span>
                        <span className="lb-title">{card.title}</span>
                        <span className="lb-time">{card.time}</span>
                      </div>
                      <Waveform bars={card.bars} playing={playing} progress={playing ? progress : undefined} />
                      {card.tag && <span className="lb-tag">{card.tag}</span>}
                    </div>
                  )
                })}
                {/* The travelling card's landing slot in the next column */}
                {ci === 1 && (
                  <div className={`lb-card is-traveller is-landing${moved ? '' : ' is-gone'}`}>
                    <div className="lb-card-top">
                      <span className="lb-play">▶</span>
                      <span className="lb-title">shower bridge??</span>
                      <span className="lb-time">0:26</span>
                    </div>
                    <Waveform bars={seedBars(9)} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
