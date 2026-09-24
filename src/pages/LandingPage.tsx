import { ContactForm } from '@/components/ui/ContactForm'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { prefetchAppChunks } from '@/lib/prefetchRoutes'
import '@/styles/landing.css'
import { LiveBoard } from '@/components/landing/LiveBoard'
import { MergeDemo } from '@/components/landing/MergeDemo'
import { OfflineDemo } from '@/components/landing/OfflineDemo'
import { HeroStack } from '@/components/landing/HeroStack'
import { Wordmark } from '@/components/ui/Wordmark'
import { usePageTitle } from '@/hooks/usePageTitle'
import { CookieSettingsLink } from '@/components/layout/AdConsent'
/* From prices.ts, not billing.ts: billing imports the Supabase client, and
   that one import put all of supabase-js in the landing's first download. */
import { FOUNDING_CAP, FOUNDING_OFFER, FOUNDING_TERMS, PRICES } from '@/lib/prices'
import { captureFirstTouch } from '@/lib/attribution'
import {
  PRICE_TABLE,
  getPreferredCurrency,
  money,
  perMonthOfYear,
  setPreferredCurrency,
  type Currency,
} from '@/lib/currency'

/* The money-back guarantee (Owen, 18 Sept): 30 days, full refund, no
   questions, yearly and monthly alike. It sits under every buy button in
   place of "Cancel anytime", which is not risk reversal: it only tells
   someone what happens after they have already paid. */
const GUARANTEE_LINE = '100% money-back guarantee for 30 days. No questions.'

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
    // 17 Sept, Owen: "read from the file" was not true in practice (most
    // bounces carry no key or BPM tags). Now says what the app does.
    title: 'Key, tempo and tuning on every song',
    desc: 'Type them once on the song and filter the whole board by key or BPM. Every idea in D at 92, in one tap.',
  },
  {
    size: 'small',
    icon: '#',
    // Was live in the app and in the hero mockup ("riff", "lyrics drafted",
    // "sent to producer" already sit under cards in LiveBoard) but never
    // named on the page as its own feature. Confirmed against boardRepo.ts
    // before writing this: song.tags is free text, BoardFilters filters the
    // board by activeTag, and it is not a fixed list. Answers a real ask from
    // the research: pulling up "everything tagged riff" instead of scrolling
    // a whole column.
    // "Four defaults to start" was wrong: PRESET_TAGS in tagColors.ts ships
    // ten, and the old title named half-written, which is a COLUMN and not a
    // tag. Counted against the code rather than the previous draft.
    title: 'Riff, chorus, lyrics finished',
    desc: 'Tag a take with whatever it actually is. Ten to start, add your own, and filter the board down to just the ones that match.',
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
  if (val === '?') return <span className="tick tick--unknown" aria-label="Not confirmed">?</span>
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
  //
  // Samply is IN as a seventh column (Owen, 18 Sept: "I thought we were
  // putting Samply on the comparison"). It was left out above because it never
  // came up in the r/Songwriting threads, which is still true of the
  // songwriting side. But Listen now competes with Samply directly for mixes
  // and masters, so leaving it out would be dodging the one rival that side
  // actually has. Every Samply cell was checked on 18 Sept against Samply's
  // own docs (docs.samply.app: sharing, applications, playback-quality,
  // comments, projects) and its published plans. Where the docs do not say,
  // the cell is "?" and the footnote says so, rather than a guess either way.
  // Samply WINS or ties real rows (version stacks, password links) and they
  // are conceded, for the same reason Trello's first row is.
  { feature: 'A board your songs move across', songdrafts: true,      voicememos: false,  notes: 'partial',  trello: true,  dubnote: false,       tapeit: false,  samply: false },
  // Samply stacks versions on one track and A/Bs them: that is this row.
  { feature: 'Every take stacked on one song', songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false,  samply: true },
  { feature: 'Lyrics and the recording together', songdrafts: true,   voicememos: false,  notes: 'partial',  trello: 'partial',  dubnote: false,  tapeit: false,  samply: false },
  { feature: 'Merge two half-songs into one',  songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false,  samply: false },
  // AUDITED 31 Aug. This row said "read off the file" with a full tick, which
  // overclaims twice over. extractFileMetadata reads common.key and common.bpm
  // from ID3 TAGS. It does not analyse audio. A voice memo carries no such
  // tags, so for the primary use case these fields are always empty, and the
  // drawer's manual key/tempo/tuning inputs exist precisely because of that.
  // Dubnote's paywall advertises real BPM DETECTION, so on the harder
  // capability they beat us, and the old row had that backwards.
  { feature: 'Filter by key and tempo', songdrafts: true, voicememos: false, notes: false, trello: false, dubnote: true,  tapeit: 'partial',  samply: '?' },
  { feature: 'Comments pinned to a timestamp', songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: false,      tapeit: false,  samply: true },
  // Added 18 Sept with the Samply column: the Listen side's own question.
  // songdrafts: ShareCollectionSheet sets a password on a playlist link.
  // Samply: "Add a password for extra security" (docs, sharing). Dubnote and
  // Tape.it: neither site says either way (Tape.it mentions private shared
  // mixtapes, not passwords), so "?" rather than a cross we cannot stand by.
  { feature: 'A password on a share link',     songdrafts: true,      voicememos: false,  notes: false,      trello: false,  dubnote: '?',        tapeit: '?',  samply: true },
  { feature: 'Deleting here is not deleting everywhere', songdrafts: true, voicememos: false, notes: false,  trello: 'partial',  dubnote: 'partial',  tapeit: 'partial',  samply: '?' },
  // Samply: offline listening is in its iOS app; the web and Android app
  // are a PWA with no offline claim in the docs. Hence partly.
  { feature: 'Works fully offline',            songdrafts: true,      voicememos: true,   notes: true,       trello: 'partial',  dubnote: true,  tapeit: true,  samply: 'partial' },
  // Still conceded, and it stays, but it was WRONG rather than merely modest.
  // "Recording quality: partial" implied songdrafts half-records. It does not
  // record at all: there is no MediaRecorder and no getUserMedia anywhere in
  // the codebase, and no sampling either. The row now says the true thing, and
  // losing it four to two is on message rather than damaging, because the whole
  // pitch is "keep recording in Voice Memos, songdrafts is what happens next".
  { feature: 'Records the audio itself',       songdrafts: false,     voicememos: true,      notes: 'partial', trello: false, dubnote: true,      tapeit: true,  samply: false },
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
    // 18 Sept: said what is true for each side. The songwriting board opens
    // offline once installed (the service worker serves the app, the library
    // is in IndexedDB). Listen needs "Make offline" on a playlist first
    // (MixesRoom OfflineButton), which saves every version to the device.
    a: 'Yes. Install it and the songwriting board opens with no signal, with everything you\'ve imported already on your device. For Listen, tap Make offline on a playlist and every track in it plays offline too. It catches up on sync when you resurface.',
  },
  {
    // Was "What happens to a song I never finish?", which Owen called a
    // non-question, correctly: nobody asks that, and the answer was
    // reassurance nobody needed. The real question a sceptic has at this
    // point is whether an organiser can do anything about finishing at all.
    // Answering it honestly is stronger than dodging it, and it matches the
    // discipline section rather than contradicting it.
    q: 'Will this actually make me finish songs?',
    a: 'On its own, no, and anything that says otherwise is selling you something. What it does is smaller and more useful: it makes the good idea findable in November instead of buried at memo 800, so the deciding you were going to do is possible at all. The finishing is still yours.',
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
    // REINSTATED by Owen, 18 Sept: he wants to say an App Store version is on
    // the way, so people can share straight from Voice Memos. His call, one
    // plain line, no date promised.
    a: 'Import via the Files app on iPhone and run songdrafts in your mobile browser. You can install it to your home screen and it opens in its own window, offline. An App Store version is on the way, so you can share straight from Voice Memos.',
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
    // Rewritten 15 Sept. Said cancelling "doesn't take anything away", but
    // cloud copies are removed 90 days after a plan ends (retention-sweep),
    // and a take recorded on a phone may have no other copy. That removal is
    // gated on the two warning emails actually having been sent.
    q: 'What if I stop paying?',
    a: 'Sync and sharing stop. Songs on your devices stay, and the zip export always works. Copies in our cloud are kept for 90 days, and we email you twice before they go.',
  },
  {
    // 18 Sept, Owen: one guarantee for both plans, 30 days, no questions.
    // Was yearly 30 days, monthly 14.
    q: 'Can I get my money back?',
    a: 'Yes, all of it. Every plan has a 100% money-back guarantee for 30 days. Pay yearly and the year comes back; pay monthly and the month comes back. No questions. The plan ends when the refund is made, and your songs stay on your device and export as one zip. Use the refund button in Settings, or the contact form.',
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

/* No scroll reveals, no fade-ins, anywhere on this page. Sections used to
   fade up as an IntersectionObserver caught them, and Owen's read of the real
   page was that it looked like it was still loading, arriving in pieces as he
   scrolled. The whole page is simply there. Do not add a reveal back. */

/** Dollars or pounds, a small $ / £ switch. Remembered for the next visit. */
function CurrencyToggle({
  currency,
  onChange,
}: {
  currency: Currency
  onChange: (next: Currency) => void
}) {
  return (
    <div className="currency-toggle" role="group" aria-label="Currency">
      {(['usd', 'gbp'] as const).map((c) => (
        <button
          key={c}
          type="button"
          className={currency === c ? 'is-active' : ''}
          aria-pressed={currency === c}
          aria-label={c === 'usd' ? 'US dollars' : 'Pounds'}
          onClick={() => onChange(c)}
        >
          {PRICE_TABLE[c].symbol}
        </button>
      ))}
    </div>
  )
}

/**
 * The price card: yearly or monthly, in dollars or pounds, with the founding
 * offer leading the yearly side while any of the 100 places are left.
 *
 * Prices decided 15 Sept 2026: $79 a year, $12 a month (£59 and £9, see
 * lib/currency). No $1 week and no trial. The $49 founding offer is built but
 * off (FOUNDING_OFFER in prices.ts), and is dollars only. If it is ever on,
 * its condition is said here, at the point of sale.
 *
 * The refund used to be kept, not advertised: a button in Settings and a line
 * in the FAQ. Owen reversed that on 18 Sept. It is now a 30-day money-back
 * guarantee, said on this card, under both Get started buttons, in the FAQ
 * and in the terms.
 *
 * The count of places is read from the database, the same number the checkout
 * enforces. If it cannot be read the page still offers the price, without a
 * number, rather than inventing one.
 */
function PricingToggle({
  currency,
  onCurrency,
}: {
  currency: Currency
  onCurrency: (next: Currency) => void
}) {
  const [annual, setAnnual] = useState(true)
  const [placesLeft, setPlacesLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!FOUNDING_OFFER) return
    let live = true
    // Loaded only when the offer is on, so the client stays off the landing.
    void import('@/lib/billing')
      .then((m) => m.getFoundingPlacesLeft())
      .then((left) => {
        if (live) setPlacesLeft(left)
      })
    return () => {
      live = false
    }
  }, [])

  const table = PRICE_TABLE[currency]
  const founding = FOUNDING_OFFER && annual && placesLeft !== 0
  const perMonth = !annual
    ? money(currency, table.month)
    : founding
      ? money('usd', (PRICES.founding.amount / 12).toFixed(2))
      : money(currency, perMonthOfYear(currency))

  return (
    <div className="price-card">
      <div className="price-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={annual ? 'is-active' : ''}
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
        >
          Yearly
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

      <div className="price-top">
        <p className="price-trial">
          {founding
            ? `Founding price for the first ${FOUNDING_CAP} yearly plans${placesLeft != null ? `. ${placesLeft} left` : ''}.`
            : '100% money-back guarantee'}
        </p>
        <CurrencyToggle currency={currency} onChange={onCurrency} />
      </div>

      <p className="price-headline">
        {perMonth}
        <span className="price-period"> a month</span>
      </p>
      <p className="price-secondary">
        {founding
          ? `${FOUNDING_TERMS} After the first ${FOUNDING_CAP}, $${PRICES.year.amount} a year.`
          : annual
            ? `Billed yearly, ${money(currency, table.year)}. ${money(currency, table.month * 12 - table.year)} less than paying monthly.`
            : `Billed monthly. Everything included, no limits on songs, playlists or links.`}
      </p>

      <Link to="/sign-up" className="price-cta" onMouseEnter={prefetchAppChunks}>
        Start for {perMonth} a month
      </Link>

      <p className="price-refund">
        Not for you? Ask within 30 days and every penny comes back, yearly or monthly. Your
        songs stay yours: they are on your device, and export as one zip. The plan ends when
        the refund is made.
      </p>

      {/* #14: was a 16px-tall line of text, the last sub-44px target left. */}
      <ContactForm />

      <ul className="price-includes">
        <li>The board, and every take stacked on one song</li>
        <li>Sync across your devices, and the whole library offline</li>
        <li>Share links with timestamped comments, no account for them</li>
        <li>Export the whole library as a zip, on any device that has it, whether or not you are paying</li>
      </ul>
    </div>
  )
}

/* The hero mesh used to be a full-viewport layer animating on a 22s loop,
   with an IntersectionObserver to pause it off-screen. It is now a still
   gradient painted once (18 Sept), so there is nothing to pause. */

/**
 * The browser bar follows the paper ground on this page. index.html sets the
 * app's dark slate for every route; on a light page that read as a dark
 * strip glued to the top. Restored on the way out to the app.
 */
function usePaperThemeColor() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const before = meta.getAttribute('content')
    // The hero's top edge, not paper: on a phone the browser bar takes this
    // colour, and paper made a pale strip above the gradient.
    meta.setAttribute('content', '#d6e8df')
    return () => {
      if (before) meta.setAttribute('content', before)
    }
  }, [])
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  // Dollars or pounds, chosen once and remembered. Every price on the page
  // reads from this: hero, compare line, price card, closing band.
  const [currency, setCurrency] = useState<Currency>(getPreferredCurrency)
  const pickCurrency = (next: Currency) => {
    setCurrency(next)
    setPreferredCurrency(next)
  }
  usePageTitle(
    'songdrafts · Finish more songs',
    'A board for your voice memos. Stack takes, drag songs right as they get better, send a demo link. Works offline. Nobody trains on your music.',
  )
  usePaperThemeColor()
  // First-touch attribution (utm tags, ref, referrer). See lib/attribution.
  useEffect(() => captureFirstTouch(), [])
  // 18 Sept, Owen: the solid strip over the hero "looks a bit shit". The nav
  // is clear at the top so the hero gradient runs to the edge, and only
  // takes the paper ground once the page scrolls under it.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="landing">
      <nav className={scrolled ? 'is-scrolled' : undefined}>
        <div className="logo">
          <Wordmark />
        </div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#listen">Listen</a></li>
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
          <Link
            to="/sign-up"
            className="nav-cta nav-cta--app"
            onMouseEnter={prefetchAppChunks}
            onTouchStart={prefetchAppChunks}
          >
            Create account
          </Link>
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
            ['#listen', 'Listen'],
            ['#compare', 'Compare'],
            ['#pricing', 'Pricing'],
            ['#faq', 'FAQ'],
          ].map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </a>
          ))}
          <Link to="/sign-up" className="mobile-menu-signin" onClick={() => setMenuOpen(false)}>
            Create account
          </Link>
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
          {/* C1 in the audit: "Stop losing songs to the void" directly under
              a headline that starts "Stop losing" was the same idea twice in
              two lines. Split so the problem lands before the product does.
              The void line moves to the closing CTA, where it sets up
              "a proper home". */}
          <p className="hero-sub">
            You've got hundreds of voice memos called "New Recording 612". Somewhere in
            there is the single.
          </p>
          {/* 17 Sept, Owen: mixes need to be as clear as songwriting, on the
              same page. The two jobs, said side by side, each jumping to its
              own section. */}
          <p className="hero-sub hero-sub--second">
            songdrafts is where a song lives while you write it, and where the mixes go when
            they come back: one link to a label, lossless.
          </p>
          {/* Waitlist REMOVED (BD ruling 6). There was no confirmation email
              and no mechanism to send one, so every signup got a tick on screen
              and silence afterwards. A page that says "delete means delete" while
              quietly pocketing addresses it never writes back to is the exact
              hypocrisy this product positions against. It returns when there is a
              real confirmation email and a promise we keep. */}
          <Link to="/sign-up" className="hero-cta" onMouseEnter={prefetchAppChunks}>
            Start for {money(currency, perMonthOfYear(currency))} a month
          </Link>
          {/* The guarantee, under the button, in place of a cancel line. */}
          <p className="hero-guarantee">{GUARANTEE_LINE}</p>
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

        {/* B10: the hero used the left two-thirds and left the right empty. */}
        <HeroStack />

        {/* The real app, full width, the second beat of the page. Re-shot by
            scripts/shoot-hero.mjs on every visual release. */}
        {/* Was a static PNG of the board. A dead screenshot cannot say "this
            tool is good"; it says "here is a picture of some software". The
            live version moves: waveforms breathe, a playhead sweeps the
            playing card, and a card lifts out of Ideas into Half written every
            few seconds, which is the one gesture the product is about. */}
        <LiveBoard />
      </section>

      {/* Owen's record, moved up here (18 Sept) from the grey box near the
          bottom of the page. One quiet line under the hero, said once, not
          repeated lower down. */}
      <p className="hero-credential">
        Built by the team behind two million streams, BBC Introducing, and sold out rooms across
        the UK and Europe.
        <span> We still lost the good ones in a list of a thousand files.</span>
      </p>

      {/* 17 Sept, Owen: the page only spoke to songwriters, but Listen is a
          whole second reason to be here: mixes back from the producer, sent
          to a label as one link. Same record shape as the app itself. */}
      <section className="listen-band" id="listen">
        <div className="listen-band-inner">
          <div>
            <div className="section-label">Listen</div>
            <h2>
              Your mixes,
              <br />
              <em>sent as one link.</em>
            </h2>
            <p className="listen-lede">
              Demos, mixes and masters in playlists with a cover. One link to a label, your band or your
              mix engineer. They press play, no account.
            </p>
            <ul className="listen-points">
              <li>Lossless. The exact file your engineer sent, never compressed.</li>
              <li>Every version on one track. Switch v1 to v2 and keep your place in the song.</li>
              <li>Notes pinned to the second, from you or whoever you send it to.</li>
              <li>Links that expire, a password if you want one, downloads off unless you say so.</li>
            </ul>
            <Link to="/sign-up" className="hero-cta" onMouseEnter={prefetchAppChunks}>
              Start sharing
            </Link>
          </div>

          {/* Drawn in the same shape as Listen itself (record.css): cover,
              mono eyebrow, serif title, pills, a quiet zebra tracklist with
              versions and length on the right, a note pinned to a second. */}
          <div className="listen-mock" aria-hidden>
            <div className="listen-mock-top">
              <div className="listen-mock-cover">
                <span style={{ height: '46%' }} />
                <span style={{ height: '78%' }} />
                <span style={{ height: '58%' }} />
                <span style={{ height: '92%' }} />
              </div>
              <div className="listen-mock-head">
                <div className="listen-mock-eyebrow">Playlist · 4 tracks · 15:02</div>
                <div className="listen-mock-title">Evergreen EP</div>
                <div className="listen-mock-artist">Harbour Lights</div>
              </div>
            </div>
            <div className="listen-mock-pills">
              <span className="is-primary">▶ Play</span>
              <span>Share</span>
              <span>Make offline</span>
            </div>
            <ol className="listen-mock-list">
              <li className="listen-mock-row is-playing">
                <span className="n">
                  <i /><i /><i />
                </span>
                <span className="t">Heaven <small>Master</small></span>
                <span className="v">v3</span>
                <span className="d">3:10</span>
              </li>
              <li className="listen-mock-note">
                <b>1:43</b>
                <span>Vocal a touch louder in the chorus?</span>
              </li>
              <li className="listen-mock-row">
                <span className="n">2</span>
                <span className="t">Lost <small>Mix</small></span>
                <span className="v">v2</span>
                <span className="d">4:49</span>
              </li>
              <li className="listen-mock-row">
                <span className="n">3</span>
                <span className="t">Appreciation <small>Mix</small></span>
                <span className="v">v1</span>
                <span className="d">3:36</span>
              </li>
              <li className="listen-mock-row">
                <span className="n">4</span>
                <span className="t">Evergreen <small>Demo</small></span>
                <span className="v">v4</span>
                <span className="d">3:27</span>
              </li>
            </ol>
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
          No renaming files. No scrolling past the same few hundred untitled memos looking for
          the one with the good chorus.
        </p>
        <div className="features-grid">
          {FEATURES.map(({ icon, title, desc, size }) => (
            <div key={title} className={`feature-card is-${size}`}>
              <div className="feature-icon">{icon}</div>
              <h3 className="feature-title">{title}</h3>
              <p className="feature-desc">{desc}</p>
            </div>
          ))}
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
        {/* Owen, 18 Sept: the sentence that says what this replaces, next to
            the table that proves it. Price follows the currency switch. */}
        <p className="compare-oneline">
          Samply for sending mixes and a Trello board for the songs, in one thing, for{' '}
          {money(currency, PRICE_TABLE[currency].year)} a year.
        </p>
        <div className="compare-wrap">
          {/* Scrolls sideways inside its card on a phone, never the page. */}
          <div className="compare-scroll">
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
                <th className="compare-col">Samply</th>
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
                  <td className="compare-cell"><Tick val={row.samply} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {/* Was one paragraph doing three jobs at once (the half, the
              tilde, the loss). Split so each claim is its own line rather
              than making the reader hold three footnotes in their head at
              once. */}
          <ul className="compare-footnotes">
            <li>~ means partly. Apple Notes holds lyrics but not the recording. Samply plays offline in its iPhone app.</li>
            <li>? means their own site and docs do not say, so we have not guessed.</li>
            <li>Samply is built for sending mixes and masters, and it does that well: version stacks and password links are real there too.</li>
            <li>The one we lose outright: songdrafts doesn't record, and isn't trying to. You keep recording in Voice Memos. Left in, because a table that wins everything is one nobody believes.</li>
          </ul>
          <p className="compare-footnote-date">Checked 18 September 2026.</p>
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
          Drag a song right whenever it gets better, and tag it with what it is: riff, chorus,
          half-written, whatever you'd call it. Then filter by tag instead of scrolling.
        </p>
        {/* Tags shown IN the pipeline, per Owen: "I wanna show that you can
            tag stuff in the bit where you move it along the pipeline as
            well." Columns are where a song IS; tags are what it IS. Both
            live on the same card, so the ramp shows both. Each step carries
            the tags a song at that stage tends to wear. */}
        <div className="howitworks-ramp">
          {[
            ['inbox', 'Inbox', 'Everything lands here.', ['idea']],
            ['ideas', 'Ideas', 'Worth another listen.', ['riff', 'verse']],
            ['half', 'Half finished', 'It has a shape now.', ['chorus', 'half-written']],
            ['done', 'Finished', 'Send it to someone.', ['sent to producer']],
          ].map(([key, title, sub, tags]) => (
            <div key={key as string} className={`ramp-step ramp-step--${key}`}>
              <span className="ramp-step-bars" aria-hidden>
                <i /><i /><i /><i />
              </span>
              <span className="ramp-step-title">{title}</span>
              <span className="ramp-step-sub">{sub}</span>
              <span className="ramp-step-tags" aria-hidden="true">
                {(tags as string[]).map((t) => (
                  <span key={t} className="ramp-tag">{t}</span>
                ))}
              </span>
            </div>
          ))}
          <div className="ramp-step ramp-step--add" aria-hidden="true">
            <span className="ramp-step-plus">+</span>
            <span className="ramp-step-title">Your own</span>
            <span className="ramp-step-sub">Rename, reorder, add as many as you use.</span>
            <span className="ramp-step-tags">
              <span className="ramp-tag ramp-tag--add">+ tag</span>
            </span>
          </div>
        </div>
      </section>

      <WaveDivider />

      {/* Merge, promoted out of the grid to a full-width band */}
      <section className="merge-band">
        <div className="merge-band-inner">
          <div className="section-label">Merge</div>
          <h2 className="section-h2">The verse was already written.<br /><em>You just wrote it in March.</em></h2>
          <p>
            Most songs are not written in one go. They are a chorus from one month and a
            verse from another that turn out to belong together. In a pile of files those
            two never meet. On a board they are two cards, side by side.
          </p>
          <p>
            Drag one card onto the other and they become one song: every take, every tag,
            every comment from both, kept in order. Nothing is lost in the merge. And when
            you are hunting the one in D at 92bpm to go with it, filter by key and tempo
            instead of scrolling.
          </p>
        </div>
        <MergeDemo />
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
              you're on a train with nothing else to do. Install songdrafts and the songwriting
              board opens with no internet. Listen, sort, write notes. It syncs up later without
              being asked.
            </p>
            <ul className="offline-list">
              <li>The whole songwriting board, no internet, once installed</li>
              <li>Listen playlists too, once you tap Make offline</li>
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
                And it installs. Not a bookmark: its own icon in your dock or on your home
                screen, its own window, and it opens with no internet at all. Your recordings
                are already on the device, so there is nothing to download first and nothing
                to wait for. Open it on a plane and the whole library is there.
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
            <OfflineDemo />
          </div>
        </div>
      </section>

      {/* The iCloud-is-a-mirror section that sat here is gone. Owen: "we don't
          solve that problem, and it's not a flex, so I don't really get it."
          Fair. The 30-day trash and the zip export are still true and still
          on the page, in the trust list and the FAQ, where they read as
          facts about the product rather than a warning about someone else's. */}
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
          {/* The credential line used to sit here in a grey box. Owen, 18
              Sept: it belongs under the hero, as one quiet line, so it is
              read before anything else. Moved, not duplicated. */}
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
                  <h3>{title}</h3>
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
              Recorded in the car. Found again in <em>November.</em>{' '}
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
            {/* 15 Sept, the consultant's rule: no security adjectives, only
                things a reader could check. "Synced encrypted" came out (an
                adjective), and so did "Delete means delete": the daily job
                that removes a trashed song's files from storage is not
                switched on yet (028), so it is not true for songs today.
                Both can come back once they are. The zip and the revoke
                controls were each verified on 15 Sept. */}
            <li>On your device by default.</li>
            <li>Export everything, any time, in one zip.</li>
            <li>Share links you can revoke, one at a time or all at once.</li>
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
        {/* Yearly or monthly. Nothing here charges anyone: checkout lives
            in the app, and billing is off until BILLING_LIVE. */}
        <h2 className="section-h2">One plan. Everything in it.</h2>
        <PricingToggle currency={currency} onCurrency={pickCurrency} />
        {/* Used to carry its own "What happens if I stop paying?" card, right
            under the price. That question already has an answer in the FAQ
            section below (same text, kept there), so this was a duplicate,
            and a worse one: it raised quitting at the exact moment someone is
            deciding to pay, which is the wrong place to plant that doubt.
            Owen's call. The pricing section now ends on the price and what is
            included, not on an exit door. */}
      </section>

      {/* The last push, and it comes straight after the price (Owen, 18
          Sept: people should see what it costs before the final ask). */}
      <section className="cta-section" id="get-started">
        <p className="cta-kicker">Stop losing songs to the void.</p>
        <h2>
          Your songs deserve
          <br />
          <em>a proper home.</em>
        </h2>
        <p>Open the board. Drag the first memo in. See what you've actually got.</p>
        <Link to="/sign-up" className="cta-button" onMouseEnter={prefetchAppChunks}>
          Start for {money(currency, perMonthOfYear(currency))} a month
        </Link>
        <p className="cta-status">{GUARANTEE_LINE}</p>
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
          <span aria-hidden="true">·</span>
          <Link to="/contact">Contact</Link>
          <span aria-hidden="true">·</span>
          <CookieSettingsLink />
        </nav>
        {/* Audit F1: a site whose pitch is "your music is yours" had no
            copyright line asserting its own. Entity name and address (F2)
            are Owen's to supply; the line is written so they slot in. */}
        {/* F2. Just "songdrafts", on Owen's instruction: he did not ask for
            his own name on the site and I put it there uninvited.
            NOT "songdrafts Limited" either — using Limited for a business
            that is not incorporated is an offence under the Companies Act
            rather than a formality, and songdrafts is not registered.
            A trading name on its own is fine for a site that is not yet
            taking money. The identity and address requirements bite at the
            first payment, not before. */}
        <p className="footer-copyright">&copy; 2026 songdrafts. All rights reserved.</p>
      </footer>
    </div>
  )
}
