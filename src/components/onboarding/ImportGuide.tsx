import { useState } from 'react'
import { detectDevice, importPlaceFor, type ImportPlace } from '@/lib/devicePlatform'
import '@/styles/onboarding.css'

const PLACES: Record<ImportPlace, { label: string; steps: string[] }> = {
  computer: {
    label: 'Mac or PC',
    steps: [
      'Drag files or whole folders onto the Songwriting board. They land in your Inbox.',
      'Or click + Import audio at the bottom of your Inbox.',
    ],
  },
  iphone: {
    label: 'iPhone',
    steps: [
      'In Voice Memos, tap a recording, then Share (under ⋯), then Save to Files.',
      'In songdrafts, tap + Import audio and pick them. You can select several at once.',
    ],
  },
  android: {
    label: 'Android',
    steps: [
      'In your recorder app, share or save the recordings to Files.',
      'In songdrafts, tap + Import audio and pick them.',
    ],
  },
}

/**
 * How audio gets in, honestly (17 Sept, Owen). A home screen web app can
 * never appear in the iOS share sheet, only App Store apps can, so this says
 * the real routes and what is coming, instead of implying a share button.
 */
export function ImportGuide() {
  const [place] = useState<ImportPlace>(() => importPlaceFor(detectDevice()))
  const [others, setOthers] = useState(false)
  const shown = others ? (Object.keys(PLACES) as ImportPlace[]) : [place]

  return (
    <div className="ob-import">
      {shown.map((p) => (
        <div key={p} className="ob-import-place">
          <p className="ob-eyebrow">{PLACES[p].label}</p>
          <ol className="ob-steps">
            {PLACES[p].steps.map((step, i) => (
              <li key={step}>
                <span className="ob-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {!others && (
        <button type="button" className="ob-link" onClick={() => setOthers(true)}>
          Show other devices
        </button>
      )}

      <p className="ob-note">
        Finished demos, mixes and masters go to Listen instead: drop them onto a playlist or use +
        Add audio.
      </p>

      <p className="ob-callout">
        Sharing straight from Voice Memos into songdrafts is on the way, with an App Store version.
        In the meantime, tell your friends: every person who joins helps us build it.
      </p>
    </div>
  )
}
