import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, supabaseConfigured } from '@/lib/supabase/client'
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
    icon: '▦',
    title: 'Kanban for songs',
    desc: 'Inbox → Ideas → Demos → Finished. Every memo has a place on the board.',
  },
  {
    icon: '⧉',
    title: 'Version stacking',
    desc: 'Stack takes on one card. Hear how a song evolved without digging through folders.',
  },
  {
    icon: '2×',
    title: '2× playback speed',
    desc: 'Skim your backlog fast. Jump between versions and find the keeper in minutes.',
  },
  {
    icon: '↗',
    title: 'Phone → Mac sync',
    desc: 'Import on your phone, sign in with Google, and your memos pull down on desktop automatically.',
  },
  {
    icon: '🔗',
    title: 'Demo share links',
    desc: 'Send a listen link with optional password. Listeners pin feedback to the waveform — no account needed.',
  },
  {
    icon: '◎',
    title: 'Co-write',
    desc: 'Invite bandmates as editors or viewers. Comment on songs, compare A/B takes, stay on one board.',
  },
] as const

const STEPS = [
  ['01', 'Save from Voice Memos', 'Share a memo to Files on your iPhone, then import it in mem•.'],
  ['02', 'Land in Inbox', 'Audio shows up on your board — name it, stack versions, drag it forward.'],
  ['03', 'Sign in to sync', 'Use Google on phone and Mac so the same board stays in sync.'],
  ['04', 'Review on desktop', 'Open mem• on your Mac and every memo you captured is already there.'],
] as const

export function LandingPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const scrollToCta = () => {
    document.getElementById('early-access')?.scrollIntoView({ behavior: 'smooth' })
  }

  const joinWaitlist = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setStatus('loading')
    setMessage('')

    if (!supabaseConfigured || !supabase) {
      setStatus('success')
      setMessage("You're on the list! We'll be in touch.")
      setEmail('')
      return
    }

    const client = supabase
    const { error } = await client.from('waitlist_leads').insert({ email: trimmed })

    if (error) {
      if (error.code === '23505') {
        setStatus('success')
        setMessage("You're already on the list — we'll be in touch.")
        setEmail('')
        return
      }
      setStatus('error')
      setMessage(error.message)
      return
    }

    setStatus('success')
    setMessage("You're on the list. We'll email you when early access opens.")
    setEmail('')
  }

  return (
    <div className="landing">
      <nav>
        <div className="logo">
          mem<span>•</span>
        </div>
        <ul className="nav-links">
          <li>
            <a href="#features">Features</a>
          </li>
          <li>
            <a href="#workflow">How it works</a>
          </li>
          <li>
            <a href="#pricing">Pricing</a>
          </li>
          <li>
            <a href="#early-access">Early access</a>
          </li>
          <li>
            <Link to="/sign-in">Sign in</Link>
          </li>
        </ul>
        <Link to="/sign-in" className="nav-cta nav-cta--app">
          Sign in
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <div className="hero-tag">Studio minimal · local-first</div>
          <h1 className="hero-h1">
            Stop losing your best ideas in the <em>Voice Memo black hole.</em>
          </h1>
          <p className="hero-sub">
            mem• is a charcoal-and-mint songwriting board for the memos you actually want to finish.
            Capture from your phone, organise on a Kanban, and hear every version at 2× — without
            losing another riff to the void.
          </p>
          <div className="hero-actions">
            <Link to="/sign-in" className="btn-primary">
              Sign in to your board
            </Link>
            <button type="button" className="btn-ghost" onClick={scrollToCta}>
              Get early access
            </button>
          </div>
          <div className="hero-meta">
            <div>
              <span className="hero-stat-num">4</span>
              <span className="hero-stat-label">Kanban stages</span>
            </div>
            <div>
              <span className="hero-stat-num">2×</span>
              <span className="hero-stat-label">playback speed</span>
            </div>
            <div>
              <span className="hero-stat-num">Phone</span>
              <span className="hero-stat-label">→ Mac sync</span>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="app-preview">
            <div className="app-titlebar">
              <div className="dot dot-r" />
              <div className="dot dot-y" />
              <div className="dot dot-g" />
              <span className="app-titlebar-text">mem• — songwriting board</span>
            </div>
            <div className="kanban-board">
              {[
                { title: 'Inbox', count: 3, cards: ['Voice Memo 147', 'Voice Memo 148', 'Voice Memo 149'] },
                { title: 'Ideas', count: 2, cards: ['Midnight Call', 'Bridge idea'], featured: 0 },
                { title: 'Demos', count: 1, cards: ['Glass & Smoke'] },
                { title: 'Done', count: 1, cards: ['Frequency'] },
              ].map((col, ci) => (
                <div key={col.title} className="kanban-col">
                  <div className="col-header">
                    {col.title} <span className="col-count">{col.count}</span>
                  </div>
                  {col.cards.map((title, i) => (
                    <div key={title} className={`audio-card${ci === 1 && i === 0 ? ' featured' : ''}`}>
                      <div className="card-title">{title}</div>
                      <WaveBars playedFrac={ci === 1 && i === 0 ? 0.45 : 0} />
                      <div className="card-meta">
                        <span className="card-time">2:34</span>
                        {ci === 1 && i === 0 ? (
                          <span className="card-tag tag-stack">3 versions</span>
                        ) : (
                          <span className="card-tag tag-idea">Idea</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
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
          Everything in the black hole,
          <br />
          finally on a board.
        </h2>
        <p className="section-sub">
          No bloated DAW. No lost folders. Just the workflow you already use — voice memos, versions,
          and momentum — in one charcoal-and-mint workspace.
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

      <section className="workflow" id="workflow">
        <div className="workflow-inner">
          <div>
            <div className="section-label">Phone → Mac</div>
            <h2 className="section-h2">
              From share sheet
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
                Share from Voice Memos on your walk home. Review at 2× on your Mac the next morning.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="section-label">Pricing</div>
        <h2 className="section-h2">Start free. Grow when you share.</h2>
        <p className="section-sub">
          mem• is local-first — your memos stay on your device. Cloud sync and sharing unlock when you
          need them.
        </p>
        <div className="pricing-grid">
          <div className="pricing-card pricing-card--featured">
            <span className="pricing-tier">Solo</span>
            <p className="pricing-price">Free</p>
            <ul className="pricing-features">
              <li>Unlimited songs on your board</li>
              <li>Version stacks + 2× playback</li>
              <li>Google sign-in + cloud sync</li>
              <li>Works offline on plane &amp; train</li>
            </ul>
            <Link to="/sign-in" className="btn-primary pricing-cta">
              Open mem•
            </Link>
          </div>
          <div className="pricing-card pricing-card--beta">
            <span className="pricing-tier">Collab</span>
            <p className="pricing-price">Early access</p>
            <ul className="pricing-features">
              <li>Invite bandmates (editor / viewer)</li>
              <li>Song comments + A/B compare</li>
              <li>Shared project boards</li>
            </ul>
            <Link to="/sign-in" className="pricing-cta pricing-cta--ghost">
              Try with your band
            </Link>
          </div>
          <div className="pricing-card pricing-card--beta">
            <span className="pricing-tier">Share</span>
            <p className="pricing-price">Early access</p>
            <ul className="pricing-features">
              <li>Password-protected demo links</li>
              <li>Timestamped listener feedback</li>
              <li>Original audio fidelity</li>
            </ul>
            <Link to="/sign-in" className="pricing-cta pricing-cta--ghost">
              Share a demo
            </Link>
          </div>
        </div>
      </section>

      <section className="cta-section" id="early-access">
        <h2>
          Get out of the
          <br />
          <em>black hole.</em>
        </h2>
        <p>Join early access. Be first when mem• opens to songwriters.</p>
        <form className="waitlist-form" onSubmit={(e) => void joinWaitlist(e)}>
          <input
            className="waitlist-input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'loading'}
            required
          />
          <button type="submit" className="btn-primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Saving…' : 'Get Early Access'}
          </button>
        </form>
        {message && (
          <p className={`waitlist-message waitlist-message--${status === 'error' ? 'error' : 'success'}`}>
            {message}
          </p>
        )}
      </section>

      <footer>
        <div className="footer-logo">
          mem<span>•</span>
        </div>
        <span className="footer-text">CHARCOAL · MINT · LOCAL-FIRST</span>
      </footer>
    </div>
  )
}
