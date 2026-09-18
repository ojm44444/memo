import { useState } from 'react'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { DEVICES, detectDevice, type Device } from '@/lib/devicePlatform'
import '@/styles/onboarding.css'

const INSTALL_STEPS: Record<Device, { label: string; steps: string[] }> = {
  'iphone-safari': {
    label: 'iPhone, Safari',
    steps: [
      'Tap Share (the square with an arrow).',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add. songdrafts now opens from your home screen like any app.',
    ],
  },
  // 17 Sept, Owen was on Chrome on iPhone, where the old banner never showed.
  'iphone-chrome': {
    label: 'iPhone, Chrome',
    steps: [
      'Tap Share (the square with an arrow) in the address bar.',
      'Tap Add to Home Screen. Can’t see it? Tap More first.',
      'Tap Add. songdrafts now opens from your home screen like any app.',
    ],
  },
  android: {
    label: 'Android, Chrome',
    steps: [
      'Tap Install if Chrome offers it. If not, tap ⋮ at the top right.',
      'Tap Install app, or Add to Home screen and then Install.',
      'songdrafts sits with your other apps and opens full screen.',
    ],
  },
  'mac-chrome': {
    label: 'Mac, Chrome or Edge',
    steps: [
      'Click the install icon at the right of the address bar.',
      'No icon? In Chrome, open ⋮, then Cast, save and share, then Install page as app.',
      'It opens in its own window and lives on your Mac like any app. Keep it in the Dock.',
      'Already installed? The same menu says Open in app.',
    ],
  },
  'mac-safari': {
    label: 'Mac, Safari',
    steps: [
      'In the menu bar, choose File, then Add to Dock.',
      'Click Add. songdrafts opens from the Dock in its own window.',
    ],
  },
  pc: {
    label: 'Windows, Chrome or Edge',
    steps: [
      'Click the install icon at the right of the address bar.',
      'Click Install.',
      'songdrafts opens in its own window and shows in the Start menu. Right-click it on the taskbar to pin it.',
    ],
  },
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="ob-steps">
      {steps.map((step, i) => (
        <li key={step}>
          <span className="ob-step-num">{i + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Install songdrafts, for the device you are on. Where the browser supports
 * it (Chrome, Edge, Android) this is a real Install button; everywhere else it
 * is the steps, with the other devices one tap away.
 */
export function InstallGuide({ showOthersByDefault = false }: { showOthersByDefault?: boolean }) {
  const { canInstall, isInstalled, install } = usePwaInstall()
  const [device] = useState<Device>(() => detectDevice())
  const [others, setOthers] = useState(showOthersByDefault)
  const [picked, setPicked] = useState<Device>(device)

  if (isInstalled && !others) {
    return (
      <div className="ob-install">
        <p className="ob-note">Installed. songdrafts opens in its own window.</p>
        <button type="button" className="ob-link" onClick={() => setOthers(true)}>
          Show other devices
        </button>
      </div>
    )
  }

  return (
    <div className="ob-install">
      {!others && (
        <>
          <p className="ob-eyebrow">{INSTALL_STEPS[device].label}</p>
          {canInstall ? (
            <button type="button" className="ob-pill is-primary" onClick={() => void install()}>
              Install songdrafts
            </button>
          ) : (
            <Steps steps={INSTALL_STEPS[device].steps} />
          )}
          <button type="button" className="ob-link" onClick={() => setOthers(true)}>
            Show other devices
          </button>
        </>
      )}

      {others && (
        <>
          <div className="ob-tabs" role="tablist">
            {DEVICES.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === picked}
                className={d === picked ? 'is-on' : undefined}
                onClick={() => setPicked(d)}
              >
                {INSTALL_STEPS[d].label}
              </button>
            ))}
          </div>
          <Steps steps={INSTALL_STEPS[picked].steps} />
        </>
      )}
    </div>
  )
}
