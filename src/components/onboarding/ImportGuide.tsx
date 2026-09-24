import { useState } from 'react'
import { detectDevice, importPlaceFor, type ImportPlace } from '@/lib/devicePlatform'
import { LastImportCard } from '@/components/onboarding/LastImportCard'
import '@/styles/onboarding.css'

/**
 * How audio gets in, said the same way everywhere (tour, Help, Settings, the
 * empty board, the emails). Keep the emails in supabase/functions/_shared/
 * emails.ts in step with this.
 *
 * What is true: a home screen web app can never appear in the iOS share sheet,
 * and no web app can read the Voice Memos library, so the phone route is Save
 * to Files, then Import audio. The Mac Voice Memos folder link is NOT offered:
 * it does not work reliably (Owen, 24 Sept).
 */
const PLACES: Record<ImportPlace, { label: string; steps: string[] }> = {
  iphone: {
    label: 'iPhone',
    steps: [
      'In Voice Memos, tap a recording, tap the three dots, then Share, then Save to Files.',
      'To do several at once, tap Edit, tick the recordings, then Share, then Save to Files.',
      'Open songdrafts on your phone, tap + Import audio and pick them. They sync to your computer.',
    ],
  },
  mac: {
    label: 'Mac',
    steps: [
      'Open Voice Memos on your Mac and give iCloud a minute to sync. Your recordings appear there.',
      'Press Cmd+A to select them all, then drag them into a new folder on your Desktop.',
      'Drag that folder onto the Songwriting board, or click + Import audio and pick the files.',
      'Or on your iPhone: see iPhone. What you import there appears here on its own.',
    ],
  },
  windows: {
    label: 'Windows',
    steps: [
      'Drag audio files, or a whole folder, from File Explorer onto the Songwriting board.',
      'Or click + Import audio at the bottom of your Inbox and pick them.',
      'Recordings on your iPhone? Do them on the iPhone (see iPhone). They appear here on their own.',
    ],
  },
  android: {
    label: 'Android',
    steps: [
      'In your recorder app, share or save the recordings to Files.',
      'Open songdrafts, tap + Import audio and pick them. Select as many as you like.',
    ],
  },
}

const ORDER: ImportPlace[] = ['iphone', 'mac', 'windows', 'android']

export function ImportGuide() {
  const [place, setPlace] = useState<ImportPlace>(() => importPlaceFor(detectDevice()))
  const shown = PLACES[place]

  return (
    <div className="ob-import">
      <div className="ob-import-tabs" role="tablist" aria-label="Where are your recordings?">
        {ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === place}
            className={p === place ? 'ob-import-tab is-active' : 'ob-import-tab'}
            onClick={() => setPlace(p)}
          >
            {PLACES[p].label}
          </button>
        ))}
      </div>

      <LastImportCard />

      <ol className="ob-steps">
        {shown.steps.map((step, i) => (
          <li key={step}>
            <span className="ob-step-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <p className="ob-note">
        <strong>Keep everything in Voice Memos.</strong> We do not recommend deleting anything
        there. It stays where your recordings live, and songdrafts is where they get sorted.
      </p>

      <p className="ob-note">
        Finished demos, mixes and masters go to Listen instead: drop them onto a playlist or use +
        Add audio.
      </p>

      <p className="ob-callout">
        We know this looks like a lot of work. The first batch takes a few minutes; after that you
        only bring in new recordings, which gets quicker every time. We are building an app that
        lets you share straight from Voice Memos. Until it is ready, this is the fastest way that
        works.
      </p>
    </div>
  )
}
