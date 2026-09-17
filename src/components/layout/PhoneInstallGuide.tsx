import { useState } from 'react'

type Device = 'iphone-safari' | 'iphone-chrome' | 'android'

function detect(): Device {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/crios/i.test(ua)) return 'iphone-chrome'
  return 'iphone-safari'
}

const STEPS: Record<Device, { label: string; steps: string[] }> = {
  'iphone-safari': {
    label: 'iPhone, Safari',
    steps: [
      'Open www.songdrafts.com in Safari and sign in.',
      'Tap the Share button (the square with an arrow) at the bottom.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add. songdrafts is now on your home screen and opens like an app.',
    ],
  },
  'iphone-chrome': {
    label: 'iPhone, Chrome',
    steps: [
      'Open www.songdrafts.com in Chrome and sign in.',
      'Tap the Share button (the square with an arrow) in the address bar.',
      'Tap Add to Home Screen. If you cannot see it, tap More or Edit Actions first.',
      'Tap Add. songdrafts is now on your home screen and opens like an app.',
    ],
  },
  android: {
    label: 'Android',
    steps: [
      'Open www.songdrafts.com in Chrome and sign in.',
      'Tap the three dots at the top right.',
      'Tap Add to Home screen, then Install.',
      'songdrafts is now with your apps and opens full screen.',
    ],
  },
}

/**
 * "Put songdrafts on your phone", step by step for the browser you are in
 * (17 Sept, Owen: he was on Chrome on iPhone, where the old banner never
 * appeared). The other devices are one tap away.
 */
export function PhoneInstallGuide({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState<Device>(detect)
  const current = STEPS[device]

  return (
    <div className="send-sheet-backdrop" onClick={onClose}>
      <div
        className="send-sheet is-narrow phone-guide"
        role="dialog"
        aria-modal="true"
        aria-label="Put songdrafts on your phone"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="send-sheet-head">
          <h2 className="send-sheet-title">Put it on your phone</h2>
          <button type="button" className="send-sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="phone-guide-tabs" role="tablist">
          {(Object.keys(STEPS) as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === device}
              className={d === device ? 'is-on' : undefined}
              onClick={() => setDevice(d)}
            >
              {STEPS[d].label}
            </button>
          ))}
        </div>

        <ol className="phone-guide-steps">
          {current.steps.map((step, i) => (
            <li key={step}>
              <span className="phone-guide-num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p className="send-sheet-note">
          Your songs stay in sync between your phone and computer once you are signed in on both.
        </p>

        <div className="send-sheet-actions">
          <button type="button" className="send-sheet-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
