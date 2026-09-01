import { useState } from 'react'
import { Link } from 'react-router-dom'
import { prefetchAppChunks } from '@/lib/prefetchRoutes'
import '@/styles/landing.css'
import { LiveBoard } from '@/components/landing/LiveBoard'
import { Wordmark } from '@/components/ui/Wordmark'

/* Was a visible "build 1a2b3c4" stamp in the footer, checkable at a glance
   after a deploy that "looks the same" (a stale service worker, more than
   once). The debugging value is real; a build hash printed on a marketing
   page for every visitor is not the way to keep it. Same information, moved
   to where only someone actually checking would see it. */
console.log('[songdrafts] build', __BUILD_ID__)


const FEATURES = [
  // Sizes drive a bento layout. Six identical boxes give six features equal
  // weight, which is a lie: the board and the take-stacking ARE the product,
  // and playback speed is a nice detail. The grid should say that.
  {
    size: 'wide',
    icon: '\u25a6',
    title: 'Somewhere to come back to',
    desc: 'Inbox \u2192 Ideas \u2192 Half Finished \u2192 Finished Demo \u2192 Released, or whatever you call them. Rename the columns, add your own, put them in your order. Drag a song right when it gets better. That\'s the whole system.',
  },
  {
    size: 'tall',
    icon: '\u29c9',
    title: 'Every take on one card',
    desc: 'Second voice note for the same idea. A new riff. That bridge you sang in the shower. Drop each one onto the same song and they line up in order, so you can hear it turn into something.',
  },
  {
    size: 'small',
    icon: '\u2708',
    title: 'Works in a tunnel',
    // AUDITED 31 Aug. Was "lives on your phone, NOT ON OUR SERVERS", which is
    // false for anyone signed in: audioUpload puts every file in the `audio`
    // bucket, which is how sync between devices works at all. It also
    // contradicted the FAQ two screens down and the privacy page. The offline
    // claim is true and strong on its own and does not need the extra bit.
    // Trimmed: "A copy syncs when you resurface, which is how it reaches
    // your other devices" was the longest, most mechanical sentence in a
    // section otherwise built from short lines.
    desc: 'Your library lives on your device, so the plane, the tube and a field in Wales with one bar are all fine. Listen, sort, write. It syncs when you resurface.',
  },
  {
    size: 'small',
    icon: '\u25ce',
    title: 'Get through forty on a walk',
    desc: 'Triage the pile at 2x on the way to work, then drop to 0.75x to catch what you actually mumbled. Speed is the mechanism; getting through them is the point.',
  },
  {
    size: 'wide',
    icon: '\u2194',
    title: 'They never make an account',
    desc: 'One link to your producer, your drummer, an A&R. They press play in the browser and leave a comment pinned to 1:43. No sign-up wall, no app, no "can you WeTransfer it again". Sending someone a link that makes them register is the fastest way to look unprofessional.',
  },
  {
    size: 'small',
    icon: '\u2564',
    title: 'You already built this in Trello',
    // Owen's addition: Trello's free attachment cap is small enough that a
    // real audio file often does not fit, which is why the actual workaround
    // in the research was as often a pasted Google Drive link as a direct
    // attachment. Naming the link makes the "list with attachments" line
    // land harder, since a link is not even an attachment.
    desc: 'Cards, columns, a Google Drive link pasted onto each one because the file will not fit as an attachment. It works, right up until you need to hear it. A board that cannot play audio, stack a take or read a key is a list with links.',
  },
  {
    size: 'small',
    icon: '\u266f',
    // AUDITED: was "No typing", which is only true for a DAW bounce with ID3
    // tags on it. extractFileMetadata reads common.key/common.bpm off the
    // file's own tags and nothing else; a raw iPhone voice memo essentially
    // never carries those, so the common case still needs typing, exactly
    // what the compare table's ~ two sections down already says. This card
    // was overclaiming against the table's own honest answer.
    title: 'Key and tempo, read from the file',
    desc: 'Bounce from your DAW and songdrafts reads the key and BPM off the file and fills in the card. A raw voice memo has no tags to read, so that one you still type.',
  },
] as const

/**
 * Section divider drawn from the product's own graphic language: an oversized,
 * quiet waveform. Brand-native rather than a stock shape, and decorative, so
 * it is hidden from assistive tech.
 */
function WaveDivider({ flip = false }: { flip?: boolean }) {
  // Fixed heights so the divider is identical on every render and never
  // shifts layout between visits.
  const bars = [18, 42, 30, 66, 24, 54, 36, 78, 28, 48, 34, 62, 22, 70, 40, 56,
                26, 46, 32, 74, 20, 58, 38, 64, 30, 50, 44, 68, 24, 52]
  return (
    <div className={`wave-divider${flip ? ' is-flipped' : ''}`} aria-hidden>
      {bars.map((h, i) => (
        <span key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

function Tick({ val }: { val: boolean | 'partial' | string }) {
  if (val === true) return <span className="tick tick--yes" aria-label="Yes">✓</span>
  if (val === false) return <span className="tick tick--no" aria-label="No">✕</span>
  if (val === 'partial') return <span className="tick tick--partial" aria-label="Partial">~</span>
  return <span className="tick tick--price">{val}</span>
}

const COMPARE_ROWS = [
  // Columns changed after reading 12 r/Songwriting threads: Samply and Suonote
  // were not mentioned ONCE across any of them, while Voice Memos and Apple
  // Notes are where nearly everyone in those threads actually lives. A table
  // that beats two products your buyer has never heard of proves nothing; a
  // table that beats the thing on their home screen is the argument.
  // Trello replaces Dubnote. Dubnote was named once across 25 threads; Trello
  // was named FIVE times, unprompted, by songwriters who had hand-built this
  // product inside it: columns for stage, one card per idea, an mp3 dragged
  // onto the card, a fresh one on every iteration. People already building
  // your product by hand is stronger evidence than people saying they want it.
  //
  // Trello WINS the first row, honestly. Conceding the row it deserves is what
  // makes the rest of the table land.
  //
  // Dubnote is BACK as a sixth column (Owen, 30 Aug): Trello was an addition,
  // not a replacement. There is no cost to naming one more thing we beat, and
  // dropping a real competitor from the table reads worse than carrying it.
  { feature: 'A board your songs move across', songdrafts: true,      voicememos: false,  notes: 'partial',  trello: true,  dubnote: false,       tapeit: false },
  { feature: 'Every take stacked on one song', songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false },
  { feature: 'Lyrics and the recording together', songdrafts: true,   voicememos: false,  notes: 'partial',  trello: 'partial',  dubnote: false,  tapeit: false },
  { feature: 'Merge two half-songs into one',  songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false },
  // AUDITED 31 Aug. This row said "read off the file" with a full tick, which
  // overclaims twice over. extractFileMetadata reads common.key and common.bpm
  // from ID3 TAGS. It does not analyse audio. A voice memo carries no such
  // tags, so for the primary use case these fields are always empty, and the
  // drawer's manual key/tempo/tuning inputs exist precisely because of that.
  // Dubnote's paywall advertises real BPM DETECTION, so on the harder
  // capability they beat us, and the old row had that backwards.
  { feature: 'Key and tempo filled in from the file', songdrafts: 'partial', voicememos: false, notes: false, trello: false, dubnote: true,  tapeit: 'partial' },
  { feature: 'Comments pinned to a timestamp', songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false },
  { feature: 'Deleting here is not deleting everywhere', songdrafts: true, voicememos: false, notes: false,  trello: 'partial',  dubnote: 'partial',  tapeit: 'partial' },
  { feature: 'Works fully offline',            songdrafts: true,      voicememos: true,   notes: true,       trello: 'partial',  dubnote: true,  tapeit: true },
  // Still conceded, and it stays, but it was WRONG rather than merely modest.
  // "Recording quality: partial" implied songdrafts half-records. It does not
  // record at all: there is no MediaRecorder and no getUserMedia anywhere in
  // the codebase, and no sampling either. The row now says the true thing, and
  // losing it four to two is on message rather than damaging, because the whole
  // pitch is "keep recording in Voice Memos, songdrafts is what happens next".
  { feature: 'Records the audio itself',       songdrafts: false,     voicememos: true,      notes: 'partial', trello: false, dubnote: true,      tapeit: true },
] as const

const STEPS = [
  ['01', 'Get the audio in', 'Drag it off your desktop, or pull it from the Files app on your phone. It lands in the Inbox.'],
  // Used to claim songdrafts auto-generated a name like "Unicorn Pants" on
  // every import. That shipped, then got pulled: applying an invented name to
  // every card in a real library of hundreds read as the app making a joke
  // about your work rather than helping. The advice underneath is still real
  // (see RESEARCH-REDDIT.md, two songwriters independently gave each other
  // this exact tip), so the claim now matches what the app does: it flags an
  // unnamed one and hands you the field, it does not invent the name for you.
  ['02', 'Give it a name', "A pile of files called New Recording 612 is the whole problem, so songdrafts flags the ones that still look like filenames. One tap opens the name for editing. Songwriters swap them for something absurd and memorable, on purpose: you will remember Unicorn Pants. You will never remember New Recording 612."],
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
    // AUDITED 31 Aug. Said "A proper App Store app is being worked on". There
    // is no iOS project, no Capacitor, no React Native and no Expo anywhere in
    // the repo. Nothing is being worked on, so that was a promise to customers
    // about work that does not exist. Removed rather than softened.
    a: 'Import via the Files app on iPhone and run songdrafts in your mobile browser. You can install it to your home screen and it opens in its own window, offline. There is no App Store app.',
  },
  {
    q: 'Is my music private?',
    // AUDITED 31 Aug. "Storage you control" was doing work it had not earned:
    // the audio syncs to OUR storage, on Supabase. What is true is that you can
    // pull it all out and wipe it whenever you like, which is the thing that
    // actually matters, so the answer now says that instead.
    a: 'Your audio sits on your device first, and a copy syncs to our storage so it reaches your other devices. Nobody reads it, nobody trains anything on it, nobody at this end listens to your demos. You can export the lot as a zip or delete every trace of it whenever you want.',
  },
  {
    // The "What if songdrafts shuts down?" question was withdrawn by Owen and
    // must not come back. Pre-launch, with no track record, a heading carrying
    // the words "shuts down" plants the doubt rather than settling it, and the
    // evidence behind it was one comment in 25 threads. The reassurance itself
    // is worth keeping, so it folds into this answer as a clause: same fact,
    // no question inviting the reader to imagine the product dying.
    q: 'What if I stop paying?',
    a: 'Your audio is on your device, so cancelling doesn\'t take anything away from you. Sync and sharing go quiet until you come back. The zip export works whatever happens, so the library is never trapped anywhere.',
  },
] as const


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
 * Used to fade each section up as it scrolled into view: hidden until an
 * IntersectionObserver caught it, then a transition to visible. Owen's read,
 * scrolling the real page rather than a single screenshot: it looked like
 * the page was still loading, background and all, arriving in pieces as he
 * scrolled rather than being there already. Removed rather than tuned,
 * because the complaint was the mechanic itself (content appearing late),
 * not its timing.
 */
function useSectionReveal() {}

/**
 * Monthly / annual switch for the pricing headline.
 *
 * $49/year is $4.08/month, and asking someone to do that division in their
 * head is asking them to undersell the annual plan to themselves. Annual
 * leads with the number that actually makes the case, "billed annually" as
 * the smaller clause under it, the same pattern every SaaS pricing page uses
 * because it is the one that works.
 */
function PricingToggle() {
  const [annual, setAnnual] = useState(true)
  const perMonth = (49 / 12).toFixed(2).replace(/\.00$/, '').replace(/0$/, '')

  return (
    <div className="pricing-toggle-block">
      <div className="pricing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={annual ? 'is-active' : ''}
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
        >
          Annual
        </button>
        <button
          type="button"
          className={!annual ? 'is-active' : ''}
          aria-pressed={!annual}
          onClick={() => setAnnual(false)}
        >
          Monthly
        </button>
      </div>
      <h2 className="section-h2 pricing-headline">
        {annual ? (
          <>
            ${perMonth} a month, <em>billed annually.</em>
          </>
        ) : (
          <>
            $9 a month, <em>billed monthly.</em>
          </>
        )}
      </h2>
      <p className="pricing-toggle-note">
        {annual ? 'That is $49 a year, all at once.' : 'A year costs less than five months of this.'}
      </p>
    </div>
  )
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  useSectionReveal()

  return (
    <div className="landing">
      <nav>
        <div className="logo">
          <Wordmark />
        </div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#compare">Compare</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>

        <div className="nav-right">
          <Link
            to="/sign-in"
            className="nav-signin"
            onMouseEnter={prefetchAppChunks}
            onTouchStart={prefetchAppChunks}
          >
            Sign in
          </Link>
          <a href="#how" className="nav-cta nav-cta--app">
            See how it works
          </a>
          {/* Below 768px the nav links are hidden with nothing replacing them,
              so Compare, Pricing and FAQ were only reachable by scrolling
              8,000+ pixels. It lives inside nav-right because the <nav> is
              space-between: as a third top-level child it got distributed to
              the middle of the bar, reading as a box stuck to the wordmark. */}
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
        <div className="hero-stage">
          {/* Eyebrow badge removed earlier, stays removed: the headline
              carries the page on its own. "Stop losing songs to the void"
              (Owen's own line, offered unprompted) was tried as the H1 and
              then pulled back: he wanted the original two-line headline as
              the lead, with the void line kept "in there somewhere" rather
              than promoted to the main line. It now opens the sub-paragraph
              instead, doing the reinforcing job a kicker line would have
              done without reviving the pill badge he specifically removed. */}
        <h1 className="hero-h1">
            Stop losing <em>ideas.</em>
            <br />
            Start finishing <em>songs.</em>
          </h1>
          <p className="hero-sub">
            Stop losing songs to the void. You've got hundreds of voice memos called
            "New Recording 612". Somewhere in there is the single. songdrafts is a board for
            your music. Drag a song right as it gets better, and actually finish it.
          </p>
          {/* Waitlist REMOVED (BD ruling 6). There was no confirmation email
              and no mechanism to send one, so every signup got a tick on screen
              and silence afterwards. A page that says "delete means delete" while
              quietly pocketing addresses it never writes back to is the exact
              hypocrisy this product positions against. It returns when there is a
              real confirmation email and a promise we keep. */}
          <p className="hero-status">Not open yet.</p>
          <p className="hero-trial-note">
            Keep recording in Voice Memos. songdrafts is what happens next.
          </p>
          {/* Platform, said above the fold. Wave 2 research turned up people on
              Android phone + Mac and on Windows + iPhone, and one person who
              rejected Obsidian purely because free-tier sync does not cross
              devices. Worded to what actually ships today: a browser app, plus
              import via Files on iPhone. Nothing promised beyond that. */}
          <p className="hero-platforms">
            Runs in the browser on any desktop, and on your phone. Nothing to buy from the
            App Store.
          </p>
        </div>

        {/* The real app, full width, the second beat of the page. Re-shot by
            scripts/shoot-hero.mjs on every visual release. */}
        {/* Was a static PNG of the board. A dead screenshot cannot say "this
            tool is good"; it says "here is a picture of some software". The
            live version moves: waveforms breathe, a playhead sweeps the
            playing card, and a card lifts out of Ideas into Half written every
            few seconds, which is the one gesture the product is about. */}
        <LiveBoard />
      </section>


      <section className="features" id="features">
        <div className="section-label">Built for songwriters</div>
        <h2 className="section-h2">
          The voice memo chaos,
          <br />
          finally organised.
        </h2>
        <p className="section-sub">
          No renaming files. No scrolling past the same few hundred untitled memos looking for
          the one with the good chorus.
        </p>
        <div className="features-grid">
          {FEATURES.map(({ icon, title, desc, size }) => (
            <div key={title} className={`feature-card is-${size}`}>
              <div className="feature-icon">{icon}</div>
              <div className="feature-title">{title}</div>
              <p className="feature-desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works.
          Used to hard-code four columns and say "that's the entire system",
          which undersold what the app actually does (create, rename, delete,
          reorder columns) and, per RESEARCH-REDDIT.md, handed sceptics an
          easy objection: "your system is not my system". Nobody in the
          research organised their pile the same way, so a fixed four-step
          mockup was never going to look like their board. A fifth, dashed
          step now sits at the end of the ramp itself, not just in a sentence
          below it, so the customisable part is something you see rather than
          something you're told. */}
      <section className="howitworks" id="how">
        <div className="section-label">How it works</div>
        <h2 className="section-h2">Inbox → Ideas → Finished.<br /><em>Or however you'd put it.</em></h2>
        <p className="section-sub">
          Comes with four columns. Rename any of them, add your own, put them in your order.
          Drag a song right whenever it gets better. The board remembers so you don't have to.
        </p>
        <div className="howitworks-ramp">
          {[
            ['inbox', 'Inbox', 'Everything lands here.'],
            ['ideas', 'Ideas', 'Worth another listen.'],
            ['half', 'Half finished', 'It has a shape now.'],
            ['done', 'Finished', 'Send it to someone.'],
          ].map(([key, title, sub]) => (
            <div key={key} className={`ramp-step ramp-step--${key}`}>
              <span className="ramp-step-bars" aria-hidden>
                <i /><i /><i /><i />
              </span>
              <span className="ramp-step-title">{title}</span>
              <span className="ramp-step-sub">{sub}</span>
            </div>
          ))}
          <div className="ramp-step ramp-step--add" aria-hidden="true">
            <span className="ramp-step-plus">+</span>
            <span className="ramp-step-title">Your own</span>
            <span className="ramp-step-sub">Rename, reorder, add as many as you use.</span>
          </div>
        </div>
      </section>

      <WaveDivider />

      {/* Merge, promoted out of the grid to a full-width band */}
      <section className="merge-band">
        <div className="merge-band-inner">
          <h2 className="section-h2">The verse was already written.<br /><em>You just wrote it in March.</em></h2>
          <p>
            The chorus from March fits the verse from last week. Drag one card onto the
            other and they become one song: takes, tags, comments, all of it. And when
            you are hunting the one in D at 92bpm, stop scrolling and just ask for it.
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

            {/* Offline was already the strongest claim on this page and it
                was being undersold, because a browser tab you close is not a
                thing you reach for mid-idea. Installing is what makes the
                offline promise real, and until now the page never mentioned
                it was possible at all. */}
            <div className="install-note">
              <p className="install-note-lead">
                And it installs. Not a bookmark: its own icon, its own window, opens with no
                internet at all.
              </p>
              <ul className="install-platforms">
                <li><strong>Windows &amp; Mac</strong> Chrome or Edge, install icon in the address bar</li>
                <li><strong>Mac, Safari</strong> File, then Add to Dock</li>
                <li><strong>iPhone</strong> Share, then Add to Home Screen</li>
                <li><strong>Android</strong> Chrome offers it for you</li>
              </ul>
            </div>
          </div>
          <div className="offline-visual">
            <div className="signal-card">
              <div className="signal-bars">
                <div className="signal-bar" style={{ height: '30%' }} />
                <div className="signal-bar" style={{ height: '50%' }} />
                <div className="signal-bar" style={{ height: '70%' }} />
                <div className="signal-bar" style={{ height: '100%' }} />
              </div>
              <span className="signal-label">No signal</span>
              <div className="signal-status">
                <span className="signal-dot" />
                songdrafts still works
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brief 08's biggest addition. Originally shipped with "a copy, not a
          mirror" and the 30-day hold CUT, because neither was true: deletes
          propagated everywhere and no trash existed. Both are true now - the
          trash (Library) holds deleted songs 30 days with restore, and the
          boot sweep enforces the window - so the claim is back in. If the
          trash is ever removed, this copy goes with it. */}
      <section className="backup-section" id="backup">
        <div className="backup-inner">
          <div className="section-label">The thing nobody tells you</div>
          <h2 className="section-h2">
            iCloud is not a backup.<br /><em>It is a mirror.</em>
          </h2>
          <p className="section-sub">
            Delete a memo on your phone to free up space and it goes from everywhere at
            once. That is not a bug, it is what syncing means, and it is how most people
            find out. There is no undo and no copy left behind.
          </p>
          <div className="backup-grid">
            <div className="backup-col backup-col--them">
              <div className="backup-col-label">A synced folder</div>
              <p>One library, reflected on every device. Remove it once and it is removed.</p>
            </div>
            <div className="backup-col backup-col--us">
              <div className="backup-col-label">songdrafts</div>
              <p>
                Your recordings are stored on your device, not streamed from somewhere
                else. Deleting here does not delete it everywhere: deleted songs wait
                30 days in the trash, and you can put them back. And you can pull the
                whole library out as a zip whenever you want. That is the difference
                between a copy and a mirror.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The discipline objection, met head on.
          Across 12 r/Songwriting threads this is the loudest recurring reply,
          and one high-karma regular posted a version of it in three separate
          ones: "your problem isn't organisation, it's discipline". Any
          organisation-first pitch draws it within an hour. Nothing on this page
          touched it, so the page was walking into its own worst comment.
          Concede it completely, then reframe. */}
      <section className="discipline">
        <div className="discipline-inner">
          <div className="section-label">The fair criticism</div>
          {/* Headline and lead rewritten. "An app will not give you
              discipline" read as the app lecturing the reader about what it
              will and won't do for them; "anyone who tells you otherwise is
              selling something" was a swipe at nobody in particular that
              added an edge without adding an argument. The turn paragraph
              below (kept, unedited) already does the real work: naming the
              specific 2am-in-the-car moment. The headline now states the
              same concession as a fact about the reader, not an instruction
              to them, and the lead stops one sentence sooner. */}
          <h2 className="section-h2">
            You already have the discipline.<br />
            <em>You just lost the evidence.</em>
          </h2>
          <p className="discipline-lead">
            If you have a thousand unfinished memos, a tidier list will not make you finish
            them. That is true.
          </p>
          <p className="discipline-turn">
            Here is the part that is actually broken. You already were disciplined, on a
            Tuesday in March, at 2am, in the car. You caught it. Then it went into a pile of a
            thousand identical files and you have not heard it since. songdrafts will not
            finish your song. It makes sure the one you would have finished is still there when
            you are ready.
          </p>
          {/* Owen's own record, and it belongs HERE rather than in the hero,
              for the same reason as before: this argument needs someone who
              demonstrably finishes to make it, and the hero is peer-to-peer
              territory, not a credentials slot.

              Voice changed from first person to third on Owen's direction:
              "it should speak like a brand". Not rewritten as "the team
              behind" though, because there is no team, and inventing one to
              sound bigger is exactly the kind of claim this whole page exists
              to NOT make. Third person about one real person is brand voice
              without being a fabricated one. */}
          <p className="discipline-credential">
            Built by a songwriter with two million streams, BBC Introducing, and sold out
            rooms across the UK and Europe.
            <span> Even he lost the good ones in a list of a thousand files.</span>
          </p>
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
          Most songwriters are already running a system. Voice Memos for the humming, Apple
          Notes for the lyrics, a folder somewhere for the bounces, and if you are organised,
          a Trello board with the mp3s dragged onto the cards. It works right up until the
          pile gets big. None of it covers the messy stretch between a voice note and a
          finished demo, which is where songs actually go to die. Apple made an app for
          songwriters once, and then deleted it.
        </p>
        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                <th className="compare-col compare-col--memo">
                  <span className="compare-col-name">songdrafts</span>
                </th>
                <th className="compare-col">Voice Memos</th>
                <th className="compare-col">Apple Notes</th>
                <th className="compare-col">Trello</th>
                <th className="compare-col">Dubnote</th>
                <th className="compare-col">Tape.it</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td className="compare-feature">{row.feature}</td>
                  <td className="compare-cell compare-cell--memo"><Tick val={row.songdrafts} /></td>
                  <td className="compare-cell"><Tick val={row.voicememos} /></td>
                  <td className="compare-cell"><Tick val={row.notes} /></td>
                  <td className="compare-cell"><Tick val={row.trello} /></td>
                  <td className="compare-cell"><Tick val={row.dubnote} /></td>
                  <td className="compare-cell"><Tick val={row.tapeit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Was one paragraph doing three jobs at once (the half, the
              tilde, the loss). Split so each claim is its own line rather
              than making the reader hold three footnotes in their head at
              once. */}
          <ul className="compare-footnotes">
            <li>Half: Apple Notes holds lyrics but not the recording.</li>
            <li>~: key and tempo come off a file's tags, so a bounced mp3 arrives filled in and a raw voice memo doesn't, which is why you can also type them.</li>
            <li>The one we lose outright: songdrafts doesn't record, and isn't trying to. You keep recording in Voice Memos. Left in, because a table that wins everything is one nobody believes.</li>
          </ul>
          <p className="compare-footnote-date">Checked 31 August 2026.</p>
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
          {/* Rewritten, plainer. The walk-home/Tuesday/Friday version had a
              forced, three-beat rhythm that read as written rather than
              recalled. Same story, told the way the rest of the page talks. */}
          <div className="workflow-quote">
            <p className="workflow-quote-text">
              Recorded in the car. Found again in <em>November.</em>
              Sent to the producer the <em>same day.</em>
            </p>
            <p className="workflow-quote-sub">That is the whole product.</p>
          </div>
        </div>
      </section>

      <WaveDivider flip />

      <section className="trust">
        <div className="trust-inner">
          <h2 className="section-h2">Your music is yours.</h2>
          <p className="trust-lead">Not a promise in the small print. How it is built.</p>
          <ul className="trust-list">
            <li>On your device by default.</li>
            <li>Synced encrypted only if you sign in.</li>
            <li>Export everything, any time, in one zip.</li>
            <li>Delete means delete.</li>
            {/* Verified before writing: importAudioFiles stores the File object
                itself (audioRepo, `blob: file`). Nothing re-encodes, so this is
                a fact rather than a marketing line. */}
            <li>We never touch the audio. The file you import is the file we store, the file we play back, and the file that comes out in the zip.</li>
            <li>And nothing you record trains an AI. Not ours, not anyone's.</li>
          </ul>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="section-label">Pricing</div>
        {/* Toggle, per Owen's ask: was a static "$49 a year. Or $9 a month."
            headline. Now a real switch, and annual leads with the number
            that actually sells it, the per-month equivalent, rather than
            asking the reader to do $49 / 12 in their head. Purely visual
            pre-launch: nothing here charges anyone, same as before. */}
        <PricingToggle />
        <p className="section-sub">
          Everything included, one plan: the board, sync across your devices, offline,
          take-stacking, share links with timestamped comments. Cancel in one tap.
        </p>
        <p className="pricing-not-live">
          A year costs less than five months of monthly, because most people writing songs
          are not putting this on a company card. Not open yet, and there is nothing here to
          pay with. When it opens it will be $49/year or $9/month, first week $1.
        </p>
        {/* Used to carry its own "What happens if I stop paying?" card, right
            under the price. That question already has an answer in the FAQ
            section below (same text, kept there), so this was a duplicate,
            and a worse one: it raised quitting at the exact moment someone is
            deciding to pay, which is the wrong place to plant that doubt.
            Owen's call. The pricing section now ends on the price and what is
            included, not on an exit door. */}
      </section>

      {/* Two-column: the heading sits on its own on the left, the actual
          list on the right, rather than both stacked full-width under a
          centred header the way every other text block on the page reads.
          Owen named this section specifically as one that could move right. */}
      <section className="faq-section" id="faq">
        <div className="faq-inner">
          <div className="faq-heading">
            <div className="section-label">Questions</div>
            <h2 className="section-h2">Things people ask</h2>
          </div>
          <div className="faq-list">
            {FAQS.map(({ q, a }) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section" id="get-started">
        <h2>
          Your songs deserve
          <br />
          <em>a proper home.</em>
        </h2>
        <p>Open the board. Drag the first memo in. See what you've actually got.</p>
        <p className="cta-status">
          Not open yet. No list to join, and nothing here is collecting your email.
        </p>
      </section>

      <footer>
        {/* The giant faded wordmark is gone (Owen, 30 Aug: "I don't like the
            big songdrafts at the bottom"). An 11rem 18%-opacity word is the
            oldest trick in the SaaS footer and it says nothing. The ramp
            hairline does the sign-off instead: the identity, at actual
            strength, in one line. */}
        <div className="footer-rule" aria-hidden="true" />
        <div className="footer-row">
          <Wordmark />
          <span className="footer-text">FOR PEOPLE WHO WRITE SONGS</span>
        </div>
        {/* Findable without being loud. A privacy page nobody can reach is the
            same as not having one, and this audience is more likely than most
            to actually read it before uploading unreleased music. */}
        <nav className="footer-legal">
          <Link to="/privacy">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  )
}
