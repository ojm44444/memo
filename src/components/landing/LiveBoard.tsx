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

/* The head counts are not the number of cards drawn. They are the shape of a
   real library after a few years of using it: a stuffed inbox, a narrowing
   middle, a handful of finished things. Owen's own board reads 153 / 24 / 9 /
   7, and that ratio IS the pitch. Drawing four tidy columns of two hides it. */
const COLUMNS: { name: string; cards: Card[]; count: number }[] = [
  {
    // The left column is deliberately the ugliest thing on the page.
    //
    // A real voice memo library does not arrive with song titles on it. It
    // arrives as whatever the phone decided: "New Recording 24", or the name
    // of the building you happened to be standing in. Owen's own library is
    // almost entirely the second kind. If this column shows tidy song names
    // like the ones on the right, the hero shows a board and nothing else.
    //
    // Showing the mess is the pitch. Left to right is not just fewer cards,
    // it is filenames turning into songs.
    name: 'Voice memos',
    count: 153,
    cards: [
      { id: 'a', title: 'New Recording 24', time: '0:41', bars: seedBars(1) },
      { id: 'b', title: 'Northgate Rehearsal Rooms 12', time: '1:07', bars: seedBars(2) },
      { id: 'c', title: 'New Recording 23', time: '0:26', bars: seedBars(9) },
      { id: 'i', title: 'Pinefield Business Park 6', time: '2:38', bars: seedBars(11) },
      { id: 'j', title: 'New Recording 21', time: '0:14', bars: seedBars(12) },
      { id: 'k', title: '14 Kiln Lane 3', time: '1:52', bars: seedBars(13) },
    ],
  },
  {
    name: 'Ideas',
    count: 24,
    cards: [
      { id: 'l', title: 'car park chorus', time: '0:41', tag: 'riff', bars: seedBars(14) },
      { id: 'm', title: 'tuesday rain', time: '1:07', bars: seedBars(15) },
      { id: 'c2', title: 'shower bridge??', time: '0:26', bars: seedBars(9) },
    ],
  },
  {
    name: 'Half written',
    count: 9,
    cards: [
      { id: 'd', title: 'the kettle song', time: '2:14', tag: 'lyrics drafted', bars: seedBars(3) },
      { id: 'e', title: 'M6 at midnight', time: '3:02', bars: seedBars(4) },
    ],
  },
  {
    name: 'Finished demos',
    count: 7,
    cards: [
      { id: 'f', title: 'verse for June', time: '4:18', tag: 'sent to producer', bars: seedBars(5) },
    ],
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
                {/* The count has to follow the travelling card, or the board
                    says "2" above three cards mid-flight - which reads as a
                    duplicate rather than a move. Caught in review of the live
                    page. */}
                <span className="lb-col-count">
                  {col.count + (ci === 1 && moved ? -1 : 0) + (ci === 2 && moved ? 1 : 0)}
                </span>
              </div>
              <div className="lb-col-rule" />
              <div className={`lb-cards${ci === 0 ? ' is-deep' : ''}`}>
                {col.cards.map((card) => {
                  // "shower bridge??" travels from Ideas into Half written.
                  const travels = card.id === 'c2'
                  const hideHere = travels && moved && ci === 1
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
                {ci === 2 && (
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
