import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import '@/styles/landing.css'

const WAVE_HEIGHTS = [42, 68, 55, 82, 38, 71, 48, 90, 35, 64, 52, 78, 44, 86, 58, 72, 40, 66, 50, 84, 36, 74, 46, 80, 54, 70]

function WaveBars({ playedFrac = 0, count = 26 }: { playedFrac?: number; count?: number }) {
  const played = Math.floor(count * playedFrac)
  return (
    <div className="waveform">
      {WAVE_HEIGHTS.slice(0, count).map((height, i) => (
        <div
          key={i}
          className={`wave-bar${i < played ? ' played' : ''}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}

const FEATURES = [
  {
    icon: '✈',
    title: 'Always with you, no signal needed',
    desc: 'Fill your dead time with creativity. memo is local-first — your entire imported library lives on your device. On the tube, on a plane, in a field. Nothing stops you moving forward.',
  },
  {
    icon: '▦',
    title: 'A home for every idea',
    desc: 'Inbox → Ideas → Half Finished → Finished Demo → Released. Import from Voice Memos or any audio app, name it, tag it, and never lose track of where it\'s up to.',
  },
  {
    icon: '⧉',
    title: 'All your takes, one card',
    desc: 'Got a second voice note for the same idea? A new riff? A bridge you just sang in the shower? Pin them all to one song card — hear how it evolved without hunting through folders.',
  },
  {
    icon: '◎',
    title: 'Adjustable playback speed',
    desc: 'Dial from 0.75× to 2×. Slow down to catch a lyric, speed up to skim your backlog, fast-forward through the silence. Find the keeper take in minutes.',
  },
  {
    icon: '↗',
    title: 'Import anywhere, organise everywhere',
    desc: 'Record in Voice Memos, GarageBand, or any audio app. Import when you\'re ready — your board stays in sync across phone, Mac, and PC automatically.',
  },
  {
    icon: '↔',
    title: 'Share with your people',
    desc: 'Send a listen link to your producer, A&R, or bandmates. They leave timestamped comments pinned to the waveform — no account needed on their end.',
  },
] as const

function Tick({ val }: { val: boolean | 'partial' | string }) {
  if (val === true) return <span className="tick tick--yes" aria-label="Yes">✓</span>
  if (val === false) return <span className="tick tick--no" aria-label="No">✕</span>
  if (val === 'partial') return <span className="tick tick--partial" aria-label="Partial">~</span>
  return <span className="tick tick--price">{val}</span>
}

const COMPARE_ROWS = [
  { feature: 'Kanban workflow for songs',       memo: true,  dubnote: false,    samply: false,    suonote: false,    tapeit: false },
  { feature: 'Version stacking per song',       memo: true,  dubnote: false,    samply: 'partial', suonote: false,   tapeit: false },
  { feature: 'Adjustable playback speed',       memo: true,  dubnote: false,    samply: false,    suonote: false,    tapeit: false },
  { feature: 'Phone → Mac sync',               memo: true,  dubnote: false,    samply: true,     suonote: 'partial', tapeit: true },
  { feature: 'Share demo links',               memo: true,  dubnote: false,    samply: true,     suonote: false,    tapeit: 'partial' },
  { feature: 'Timestamped listener feedback',  memo: true,  dubnote: false,    samply: true,     suonote: false,    tapeit: false },
  { feature: 'Listener needs no account',      memo: true,  dubnote: false,    samply: true,     suonote: false,    tapeit: false },
  { feature: 'Invite co-writers',              memo: true,  dubnote: true,     samply: true,     suonote: 'partial', tapeit: true },
  { feature: 'Works fully offline',            memo: true,  dubnote: true,     samply: true,     suonote: true,     tapeit: true },
  { feature: 'Built for songwriters',          memo: true,  dubnote: true,     samply: false,    suonote: true,     tapeit: true },
  { feature: 'Price',                          memo: '£7/mo', dubnote: '$25/yr', samply: '$10/mo', suonote: 'free*', tapeit: 'free*' },
] as const

const STEPS = [
  ['01', 'Import your recordings', 'Drag audio from your desktop, or import from the Files app on iPhone. Everything lands straight in your Inbox.'],
  ['02', 'Land in Inbox', 'Audio hits your Inbox instantly — name it, tag it, and drag it to Ideas, Half Finished, or wherever it belongs.'],
  ['03', 'Move at your own pace', 'Work through ideas when inspiration strikes. Nothing forces, nothing expires. Songs move forward when you decide they\'re ready.'],
  ['04', 'Share when ready', 'Send a listen link to your producer, bandmates, or A&R. Get timestamped feedback right on the waveform.'],
] as const

const FAQS = [
  {
    q: 'Does it work without Wi-Fi?',
    a: 'Fully offline. Everything you\'ve imported lives on your device — on the tube, on a plane, in a studio with no signal. Changes sync automatically the moment you\'re back online.',
  },
  {
    q: 'What happens to a song if I never finish it?',
    a: 'Nothing. It sits in whatever stage you left it, forever. memo doesn\'t nag, delete, or archive anything for you.',
  },
  {
    q: 'Can I share demos with my producer, bandmates, or A&R?',
    a: 'Yes. Send a listen link from any song — they click it, hear the audio, and leave timestamped comments pinned to the waveform. No account needed on their end.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'You can import audio on iPhone via the Files app and use memo in your mobile browser. We\'re working towards a native App Store app for an even smoother experience.',
  },
  {
    q: 'Is my music private?',
    a: 'Yes. Your audio is stored locally on your device first, and only syncs to encrypted cloud storage you control. It\'s never shared, analysed, or accessed by anyone else.',
  },
  {
    q: 'What happens to my music if I stop paying?',
    a: 'Your audio stays on your device — memo is local-first, so cancelling doesn\'t delete anything. Cloud sync and sharing features pause until you resubscribe.',
  },
] as const

function WaitlistForm({ className }: { className?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setState('busy')
    try {
      if (supabase) {
        await supabase.from('waitlist').upsert({ email: trimmed }, { onConflict: 'email' })
      }
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).fbq) {
        ;((window as unknown as Record<string, unknown>).fbq as (...args: unknown[]) => void)('track', 'Lead', { content_name: 'waitlist' })
      }
      setState('done')
      setEmail('')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className={`waitlist-done ${className ?? ''}`}>
        <span className="waitlist-done-icon">✓</span>
        You're on the list — we'll be in touch.
      </div>
    )
  }

  return (
    <form className={`waitlist-form ${className ?? ''}`} onSubmit={(e) => void submit(e)}>
      <input
        type="email"
        className="waitlist-input"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={state === 'busy'}
      />
      <button type="submit" className="waitlist-btn" disabled={state === 'busy'}>
        {state === 'busy' ? 'Joining…' : 'Get early access'}
      </button>
      {state === 'error' && <p className="waitlist-error">Something went wrong — try again.</p>}
    </form>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item${open ? ' is-open' : ''}`}>
      <button type="button" className="faq-q" onClick={() => setOpen((v) => !v)}>
        {q}
        <span className="faq-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="faq-a">{a}</p>}
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="landing">
      <nav>
        <div className="logo">
          mem<span>o</span>
        </div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#compare">Compare</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
        <div className="nav-right">
          <Link to="/sign-in" className="nav-signin">Sign in</Link>
          <a href="#get-started" className="nav-cta nav-cta--app">
            Get early access
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <h1 className="hero-h1">
            Stop losing ideas.
            {' '}<em>Start finishing songs.</em>
          </h1>
          <p className="hero-sub">
            Every songwriter has hundreds of voice memos they'll "get back to." Most never do.
            memo is a Kanban board for your music — import your recordings, organise ideas by stage,
            collaborate with bandmates, and keep everything moving forward.
          </p>
          <WaitlistForm />
          <p className="hero-trial-note">Early access · no credit card · be first in</p>
        </div>

        <div className="hero-right">
          <div className="app-preview">
            <div className="app-titlebar">
              <div className="dot dot-r" />
              <div className="dot dot-y" />
              <div className="dot dot-g" />
              <span className="app-titlebar-text">memo — songwriting board</span>
            </div>
            <div className="kanban-board">
              <div className="kanban-col">
                <div className="col-header">Inbox <span className="col-count">254</span></div>
                <div className="audio-card">
                  <div className="card-title">Folky guitar thing</div>
                  <WaveBars />
                  <div className="card-meta">
                    <span className="card-time">0:26</span>
                    <span className="card-tag tag-idea">NEW</span>
                  </div>
                </div>
                <div className="audio-card">
                  <div className="card-title">somebody home</div>
                  <WaveBars />
                  <div className="card-meta">
                    <span className="card-time">7:21</span>
                    <span className="card-tag tag-idea">NEW</span>
                  </div>
                </div>
                <div className="audio-card">
                  <div className="card-title">Maple Leaf Business Park 12</div>
                  <WaveBars />
                  <div className="card-meta">
                    <span className="card-time">4:08</span>
                    <span className="card-tag tag-idea">NEW</span>
                  </div>
                </div>
              </div>
              <div className="kanban-col">
                <div className="col-header">Ideas / Inspiration <span className="col-count">0</span></div>
                <div className="audio-card" style={{ opacity: 0.4, borderStyle: 'dashed' }}>
                  <div className="card-title" style={{ color: 'var(--text-muted)' }}>Drop audio or drag a song here</div>
                </div>
              </div>
              <div className="kanban-col">
                <div className="col-header">Half Finished Songs <span className="col-count">2</span></div>
                <div className="audio-card featured">
                  <div className="card-title">Poem</div>
                  <WaveBars playedFrac={0.45} />
                  <div className="card-meta">
                    <span className="card-time">3:42</span>
                    <span className="card-tag tag-stack">2 versions</span>
                  </div>
                  <div className="card-tags-row">
                    <span className="card-pill" style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)' }}>Lyrics drafted</span>
                  </div>
                </div>
                <div className="audio-card">
                  <div className="card-title">9 Wheelwrights Way 27</div>
                  <WaveBars playedFrac={0.2} />
                  <div className="card-meta">
                    <span className="card-time">6:20</span>
                    <span className="card-tag tag-idea">Full idea</span>
                  </div>
                </div>
              </div>
              <div className="kanban-col">
                <div className="col-header">Finished Demos <span className="col-count">1</span></div>
                <div className="audio-card">
                  <div className="card-title">TEZ - Strangers</div>
                  <WaveBars playedFrac={0.8} />
                  <div className="card-meta">
                    <span className="card-time">3:33</span>
                    <span className="card-tag tag-stack">TRACK</span>
                  </div>
                  <div className="card-tags-row">
                    <span className="card-pill" style={{ background: 'linear-gradient(135deg,#6dffb8,#3b82f6)' }}>Full idea</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="preview-speed">
              <span className="preview-speed-label">Playback</span>
              <span className="preview-speed-pill">2×</span>
            </div>
          </div>
        </div>
      </section>


      <section className="features" id="features">
        <div className="section-label">Built for songwriters</div>
        <h2 className="section-h2">
          The voice memo chaos,
          <br />
          finally organised.
        </h2>
        <p className="section-sub">
          No more renaming files. No more scrolling through 400 untitled memos.
          Just your ideas, organised and moving forward.
        </p>
        <div className="features-grid">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="feature-card">
              <div className="feature-icon">{icon}</div>
              <div className="feature-title">{title}</div>
              <p className="feature-desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Offline spotlight */}
      <section className="offline-section">
        <div className="offline-inner">
          <div className="offline-text">
            <div className="section-label">Always with you</div>
            <h2 className="section-h2">
              No signal?<br /><em>No problem.</em>
            </h2>
            <p className="offline-sub">
              Most tools fall apart the moment you lose connection. memo is local-first — your
              entire library lives on your device. Open it on the tube, on a plane, in a field.
              Listen, rate, move songs forward. Everything syncs when you're back online.
            </p>
            <ul className="offline-list">
              <li>Full library access with no internet</li>
              <li>Playback, speed control, and notes work offline</li>
              <li>Automatic background sync when connection returns</li>
              <li>Nothing lost if the app closes mid-session</li>
            </ul>
          </div>
          <div className="offline-visual">
            <div className="signal-card">
              <div className="signal-bars">
                <div className="signal-bar" style={{ height: '30%', opacity: 0.2 }} />
                <div className="signal-bar" style={{ height: '50%', opacity: 0.2 }} />
                <div className="signal-bar" style={{ height: '70%', opacity: 0.2 }} />
                <div className="signal-bar" style={{ height: '100%', opacity: 0.2 }} />
              </div>
              <span className="signal-label">No signal</span>
              <div className="signal-status">
                <span className="signal-dot" />
                memo still works
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="compare" id="compare">
        <div className="section-label">vs. everything else</div>
        <h2 className="section-h2">
          Nothing else does
          <br />
          the whole thing.
        </h2>
        <p className="section-sub">
          Tape.it records. Dubnote captures. Samply shares with clients. Suonote structures.
          memo is the only tool built around the songwriter's actual workflow — from raw idea to finished demo, on one board.
        </p>
        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                <th className="compare-col compare-col--memo">
                  <span className="compare-logo">mem<span>o</span></span>
                </th>
                <th className="compare-col">Tape.it</th>
                <th className="compare-col">Dubnote</th>
                <th className="compare-col">Samply</th>
                <th className="compare-col">Suonote</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td className="compare-feature">{row.feature}</td>
                  <td className="compare-cell compare-cell--memo"><Tick val={row.memo} /></td>
                  <td className="compare-cell"><Tick val={row.tapeit} /></td>
                  <td className="compare-cell"><Tick val={row.dubnote} /></td>
                  <td className="compare-cell"><Tick val={row.samply} /></td>
                  <td className="compare-cell"><Tick val={row.suonote} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="compare-footnote">* Suonote and Tape.it have free tiers. Samply from $10/mo. Dubnote $24.99/yr.</p>
        </div>
      </section>

      <section className="workflow" id="workflow">
        <div className="workflow-inner">
          <div>
            <div className="section-label">The process</div>
            <h2 className="section-h2">
              From idea on your phone
              <br />
              to finished song.
            </h2>
            {STEPS.map(([num, title, desc]) => (
              <div key={num} className="step">
                <span className="step-num">{num}</span>
                <div>
                  <h4>{title}</h4>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="song-card-preview">
            <div className="scp-header">
              <span className="scp-title">Midnight Call</span>
              <span className="scp-status">3 versions</span>
            </div>
            <div className="scp-body">
              <div className="scp-audio-item">
                <div className="scp-play">▶</div>
                <WaveBars count={20} playedFrac={0.35} />
                <span className="scp-dur">4:18</span>
              </div>
              <div className="scp-audio-item scp-audio-item--dim">
                <div className="scp-play scp-play--dim">▶</div>
                <WaveBars count={20} playedFrac={0} />
                <span className="scp-dur">3:02</span>
              </div>
              <span className="scp-label">Version stack · 2× speed</span>
              <div className="scp-notes">
                Captured on the walk home. Reviewed on Mac the next morning. Sent to the producer by Friday.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-h2">One plan. Everything included.</h2>
        <p className="section-sub">
          No tiers. No features locked away. Just memo — the full thing — for £7 a month.
        </p>
        <div className="pricing-single">
          <div className="pricing-card pricing-card--featured pricing-card--solo">
            <span className="pricing-tier">memo</span>
            <p className="pricing-price">
              £7 <span className="pricing-period">/ month</span>
            </p>
            <ul className="pricing-features">
              <li>Unlimited songs &amp; version stacks</li>
              <li>Sync across phone, Mac &amp; PC</li>
              <li>Adjustable playback speed</li>
              <li>Timestamped listener feedback</li>
              <li>Invite bandmates &amp; co-writers</li>
              <li>Fully offline — works everywhere</li>
            </ul>
            <a href="#get-started" className="btn-primary pricing-cta">
              Join the waitlist
            </a>
            <p className="pricing-small">Early access. Be first to know when we open up.</p>
            <p className="pricing-trust">Your music stays private · Cancel any time</p>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-label">Questions</div>
        <h2 className="section-h2">Things people ask</h2>
        <div className="faq-list">
          {FAQS.map(({ q, a }) => (
            <FaqItem key={q} q={q} a={a} />
          ))}
        </div>
      </section>

      <section className="cta-section" id="get-started">
        <h2>
          Your songs deserve
          <br />
          <em>a proper home.</em>
        </h2>
        <p>Join the waitlist. Be first in when we open.</p>
        <WaitlistForm className="cta-waitlist" />
      </section>

      <footer>
        <div className="footer-logo">
          mem<span>o</span>
        </div>
        <span className="footer-text">CHARCOAL · MINT · LOCAL-FIRST</span>
      </footer>
    </div>
  )
}
