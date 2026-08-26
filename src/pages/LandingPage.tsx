import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { prefetchAppChunks } from '@/lib/prefetchRoutes'
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
    title: 'Works in a tunnel',
    desc: 'Your library lives on your phone, not on our servers. A plane, the tube, a field in Wales with one bar — listen, sort, write. It syncs itself later.',
  },
  {
    icon: '▦',
    title: 'A home for every idea',
    desc: 'Inbox → Ideas → Half Finished → Finished Demo → Released. Drag a song right when it gets better. That\'s the whole system.',
  },
  {
    icon: '⧉',
    title: 'Every take on one card',
    desc: 'Second voice note for the same idea. A new riff. That bridge you sang in the shower. They all stack onto one song, in order, so you can hear it turn into something.',
  },
  {
    icon: '◎',
    title: '0.75× to 2×',
    desc: 'Slow it down to catch what you actually mumbled. Speed it up to get through 40 memos on the walk to work. Skip the eleven seconds of you finding the chord.',
  },
  {
    icon: '↔',
    title: 'Send it before it\'s ready',
    desc: 'One link to your producer or your drummer. They press play in the browser and leave a comment pinned to 1:43 — no account, no app, no "can you WeTransfer it again".',
  },
  {
    icon: '♯',
    title: 'Key and tempo, read from the file',
    desc: 'Bounce from your DAW and songdrafts reads the key and BPM off the file and puts them on the card. No typing. That is usually how you find out two fragments were the same song all along.',
  },
] as const

function Tick({ val }: { val: boolean | 'partial' | string }) {
  if (val === true) return <span className="tick tick--yes" aria-label="Yes">✓</span>
  if (val === false) return <span className="tick tick--no" aria-label="No">✕</span>
  if (val === 'partial') return <span className="tick tick--partial" aria-label="Partial">~</span>
  return <span className="tick tick--price">{val}</span>
}

const COMPARE_ROWS = [
  // Rows we lose or draw are kept deliberately. A table that wins ten out of
  // ten gets discounted wholesale, including the rows we genuinely win.
  { feature: 'Kanban workflow for songs',       songdrafts: true,      dubnote: false,     samply: false,    suonote: false,     tapeit: false },
  { feature: 'Version stacking per song',       songdrafts: true,      dubnote: false,     samply: 'partial', suonote: false,    tapeit: false },
  { feature: 'Adjustable playback speed',       songdrafts: true,      dubnote: false,     samply: false,    suonote: false,     tapeit: false },
  { feature: 'Merge two songs into one',        songdrafts: true,      dubnote: false,     samply: false,    suonote: false,     tapeit: false },
  { feature: 'Phone to desktop sync',           songdrafts: true,      dubnote: false,     samply: true,     suonote: 'partial', tapeit: true },
  { feature: 'Timestamped listener feedback',   songdrafts: true,      dubnote: false,     samply: true,     suonote: false,     tapeit: false },
  { feature: 'Listener needs no account',       songdrafts: true,      dubnote: false,     samply: true,     suonote: false,     tapeit: false },
  { feature: 'Works fully offline',             songdrafts: true,      dubnote: true,      samply: true,     suonote: true,      tapeit: true },
  // Conceded, honestly.
  { feature: 'Recording quality and monitoring', songdrafts: 'partial', dubnote: true,     samply: false,    suonote: 'partial', tapeit: true },
  { feature: 'Presenting a finished mix to a client', songdrafts: 'partial', dubnote: false, samply: true,   suonote: false,     tapeit: 'partial' },
  { feature: 'Lyrics writing tools',            songdrafts: false,     dubnote: 'partial', samply: false,    suonote: true,      tapeit: false },
  { feature: 'Price, per month, USD',           songdrafts: '$9',      dubnote: '$2',      samply: '$10',    suonote: 'free',    tapeit: 'free' },
] as const

const STEPS = [
  ['01', 'Get the audio in', 'Drag it off your desktop, or pull it from the Files app on your phone. It lands in the Inbox.'],
  ['02', 'Give it a name', 'Ten seconds of typing now saves you scrolling past "New Recording 47" for the next two years.'],
  ['03', 'Move it when it earns it', 'A song shifts right when it gets better. Nothing expires, nothing nags you, nothing gets archived behind your back.'],
  ['04', 'Send it out', 'One link to whoever needs to hear it. Their notes come back stuck to the second they mean.'],
] as const

const FAQS = [
  {
    q: 'Does it work without Wi-Fi?',
    a: 'Yes, properly. Not a cut-down offline mode. Everything you\'ve imported is already on your device, so the tube and the plane and the studio with the thick walls are all fine. It catches up on sync when you resurface.',
  },
  {
    q: 'What happens to a song I never finish?',
    a: 'It sits exactly where you left it. Forever, if that\'s how it goes. Nothing gets archived, deleted or flagged as stale, and nothing sends you a reminder about it.',
  },
  {
    q: 'Can I share demos with my producer or bandmates?',
    a: 'Send them a listen link. They click, they hear it, they leave comments stuck to the exact second they\'re talking about. They never have to make an account.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Import via the Files app on iPhone and run songdrafts in your mobile browser. A proper App Store app is being worked on.',
  },
  {
    q: 'Is my music private?',
    a: 'Your audio sits on your device first and syncs to storage you control. Nobody reads it, nobody trains anything on it, nobody at this end listens to your demos.',
  },
  {
    q: 'What if I stop paying?',
    a: 'Your audio is on your device, so cancelling doesn\'t take anything away from you. Sync and sharing go quiet until you come back.',
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
      // Imported here rather than at module scope so supabase-js stays out of
      // the landing chunk. A visitor only needs it if they actually submit.
      const { supabase } = await import('@/lib/supabase/client')

      // A missing client is a failure, not a silent no-op. Previously this
      // branch was skipped and the user still saw a green tick.
      if (!supabase) {
        console.error('[songdrafts] waitlist: Supabase client unavailable')
        setState('error')
        return
      }

      // insert, not upsert: RLS grants INSERT only (there is no UPDATE policy,
      // so an upsert conflict fails). No .select() chained, because
      // waitlist_leads_select_none denies SELECT to anon — in supabase-js v2
      // omitting .select() is what keeps this a minimal-return insert.
      const { error } = await supabase.from('waitlist_leads').insert({ email: trimmed })

      // 23505 = unique violation. Already on the list is a success for the
      // person submitting, but it is NOT a new lead, so no Pixel event.
      if (error && error.code !== '23505') {
        console.error('[songdrafts] waitlist insert failed:', error.message, error.code)
        setState('error')
        return
      }

      const isNewLead = !error
      if (
        isNewLead &&
        typeof window !== 'undefined' &&
        (window as unknown as Record<string, unknown>).fbq
      ) {
        ;((window as unknown as Record<string, unknown>).fbq as (...args: unknown[]) => void)(
          'track',
          'Lead',
          { content_name: 'waitlist' },
        )
      }

      setState('done')
      setEmail('')
    } catch (err) {
      // Network-level failure (offline, DNS, CORS)
      console.error('[songdrafts] waitlist request threw:', err)
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className={`waitlist-done ${className ?? ''}`}>
        <span className="waitlist-done-icon">✓</span>
        You're on the list. We'll be in touch.
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
      {state === 'error' && <p className="waitlist-error">Something went wrong. Try again.</p>}
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

/**
 * Motion 2 of 3: sections fade up once as they arrive.
 *
 * Adds the hiding class only after mount, so the server/no-JS render is fully
 * visible and a failure here can never hide copy. Respects reduced-motion by
 * simply not opting in.
 */
function useSectionReveal() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const sections = [...document.querySelectorAll<HTMLElement>('.landing section')]
    // The hero is above the fold on load; hiding it would flash.
    const targets = sections.slice(1)
    targets.forEach((el) => el.classList.add('will-reveal'))

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.classList.remove('will-reveal')
          el.classList.add('is-revealed')
          io.unobserve(el)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    targets.forEach((el) => io.observe(el))

    // Safety net: if anything goes wrong, nothing stays hidden.
    const failsafe = setTimeout(() => {
      targets.forEach((el) => el.classList.remove('will-reveal'))
    }, 4000)

    return () => {
      io.disconnect()
      clearTimeout(failsafe)
      targets.forEach((el) => el.classList.remove('will-reveal'))
    }
  }, [])
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  useSectionReveal()

  return (
    <div className="landing">
      <nav>
        <div className="logo">
          s<span>o</span>ngdrafts
        </div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#compare">Compare</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>

        {/* Below 768px the nav links are hidden with nothing replacing them,
            so Compare, Pricing and FAQ were only reachable by scrolling
            8,000+ pixels. */}
        <button
          type="button"
          className="nav-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
        <div className="nav-right">
          <Link
            to="/sign-in"
            className="nav-signin"
            onMouseEnter={prefetchAppChunks}
            onTouchStart={prefetchAppChunks}
          >
            Sign in
          </Link>
          <a href="#get-started" className="nav-cta nav-cta--app">
            Get early access
          </a>
        </div>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="mobile-menu">
          {[
            ['#features', 'Features'],
            ['#compare', 'Compare'],
            ['#pricing', 'Pricing'],
            ['#faq', 'FAQ'],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
          <Link to="/sign-in" className="mobile-menu-signin" onClick={() => setMenuOpen(false)}>
            Sign in
          </Link>
        </div>
      )}

      <section className="hero">
        <div className="hero-left">
          <h1 className="hero-h1">
            Stop losing ideas.
            {' '}<em>Start finishing songs.</em>
          </h1>
          <p className="hero-sub">
            You've got 400 voice memos called "New Recording 47". Somewhere in there are
            three good songs. songdrafts is a board for your music — drag a song right as
            it gets better, and actually finish it.
          </p>
          <WaitlistForm />
          <p className="hero-reassure">
            Keep recording in Voice Memos. songdrafts is what happens next.
          </p>
          <p className="hero-trial-note">no spam · just a nudge when it opens</p>
        </div>

        <div className="hero-right">
          {/* A real screenshot of the real app, re-shot by scripts/shoot-hero.mjs
              on every visual release. This was a hand-drawn mockup of an
              interface that no longer existed. */}
          <div className="hero-shot">
            <img
              src="/hero-board.png"
              width={1400}
              height={880}
              alt="The songdrafts board: five columns from Inbox to Released, eleven songs with waveforms, one playing."
              loading="eager"
              decoding="async"
            />
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
          No renaming files. No scrolling past the same 400 untitled memos looking for
          the one with the good chorus.
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

      {/* How it works — three steps, stage colours */}
      <section className="howitworks" id="how">
        <div className="section-label">How it works</div>
        <h2 className="section-h2">Inbox → Ideas → Finished.</h2>
        <p className="section-sub">
          Bring the recordings in. Drag a song one column right whenever it gets better.
          That's the entire system — the board remembers so you don't have to.
        </p>
        <div className="howitworks-ramp">
          <div className="ramp-step ramp-step--inbox"><span>Inbox</span></div>
          <div className="ramp-step ramp-step--ideas"><span>Ideas</span></div>
          <div className="ramp-step ramp-step--done"><span>Finished</span></div>
        </div>
      </section>

      {/* Merge, promoted out of the grid to a full-width band */}
      <section className="merge-band">
        <div className="merge-band-inner">
          <h2 className="section-h2">Two half-songs make one whole one.</h2>
          <p>
            The chorus from March fits the verse from last week. Drag one onto the other —
            takes, tags and all. Fire and Rain was three fragments once.
          </p>
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
              Most of these tools go blank the second you lose signal, which is exactly when
              you're on a train with nothing else to do. Your library lives on your device.
              Listen, sort, write notes. It syncs up later without being asked.
            </p>
            <ul className="offline-list">
              <li>The whole library, no internet</li>
              <li>Playback, speed and notes all still work</li>
              <li>Syncs itself when you're back online</li>
              <li>Close the app mid-song, lose nothing</li>
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
          Voice Memos syncs your recordings.
          <br />
          songdrafts syncs your songwriting.
        </h2>
        <p className="section-sub">
          Tape.it records. Dubnote captures. Samply shares with clients. Suonote structures.
          They're all good at their bit. None of them cover the messy stretch between
          a voice note and a finished demo, which is where songs actually go to die.
        </p>
        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                <th className="compare-col compare-col--memo">
                  <span className="compare-logo">s<span>o</span>ngdrafts</span>
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
                  <td className="compare-cell compare-cell--memo"><Tick val={row.songdrafts} /></td>
                  <td className="compare-cell"><Tick val={row.tapeit} /></td>
                  <td className="compare-cell"><Tick val={row.dubnote} /></td>
                  <td className="compare-cell"><Tick val={row.samply} /></td>
                  <td className="compare-cell"><Tick val={row.suonote} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="compare-footnote">
            Checked 25 August 2026 from each product's own pricing page, converted to USD
            per month at that day's rate: Dubnote bills $24.99/year, Samply from $10/month.
            Suonote and Tape.it have free tiers with paid plans above them. Rates move and
            features change, so check before you decide. We lose three rows here and left
            them in.
          </p>
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
                Hummed on the walk home. Listened back properly on Tuesday. Producer had it by Friday.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust">
        <div className="trust-inner">
          <h2 className="section-h2">Your music is yours.</h2>
          <p className="trust-lead">Boringly, legally, actually.</p>
          <ul className="trust-list">
            <li>On your device by default.</li>
            <li>Synced encrypted only if you sign in.</li>
            <li>Export everything, any time, in one zip.</li>
            <li>Delete means delete.</li>
            <li>And nothing you record trains an AI — not ours, not anyone's.</li>
          </ul>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-h2">$9/month. Seven days free first — everything included.</h2>
        <p className="section-sub">
          One plan, nothing held back: the board, sync across your devices, offline,
          take-stacking, share links with timestamped comments. Cancel in one tap.
        </p>
        <div className="pricing-faq">
          <h3 className="pricing-faq-q">What happens if I stop paying?</h3>
          <p className="pricing-faq-a">
            songdrafts locks — your music doesn't. Download everything in one zip any
            time, even after you stop. We keep your cloud audio 60 days in case you come
            back (30 for unfinished trials), and we email you twice before anything is
            removed.
          </p>
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
        <p>Open the board. Drag the first memo in. See what you've actually got.</p>
        <WaitlistForm className="cta-waitlist" />
      </section>

      <footer>
        {/* A04: one confident hero-scale appearance beats five timid ones. */}
        <div className="footer-wordmark" aria-hidden>
          s<span>o</span>ngdrafts
        </div>
        <span className="footer-text">FOR PEOPLE WHO WRITE SONGS</span>
      </footer>
    </div>
  )
}
