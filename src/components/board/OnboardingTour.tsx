import { useEffect, useState, type ReactNode } from 'react'
import {
  isOnboardingTourComplete,
  setOnboardingTourComplete,
  snoozeOnboardingTour,
} from '@/lib/onboarding'
import { useBoardRole } from '@/hooks/useBoardRole'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { useUiStore, type BoardMode } from '@/stores/uiStore'
import { InstallGuide } from '@/components/onboarding/InstallGuide'
import { ImportGuide } from '@/components/onboarding/ImportGuide'
import '@/styles/onboarding.css'

/**
 * First run asks one question, then shows the side you came for.
 *
 * 17 Sept, Owen: a friend who only shares mixes should not be walked through
 * a songwriting board first. So the tour opens on a choice, switches the
 * screen behind it to that side, and ends by pointing at the other one.
 *
 * 18 Sept, Owen's rewrite: his copy, tightened. Every path ends on the same
 * two cards (theme and offline, then install), and the very first run follows
 * "Get started" with how to get audio in. Reopen it from Help or Settings.
 */
type Path = 'write' | 'listen' | 'both'

type Step = {
  eyebrow: string
  title: string
  body: string
  points?: string[]
  mode: BoardMode
  extra?: 'install'
}

const WRITE: Step[] = [
  {
    eyebrow: 'Songwriting board',
    title: 'Welcome to the songwriting board',
    body: 'Organisation is what gets songs finished. Ideas turn up whenever they like, and catching one is only half of it. Here every idea moves along a pipeline, stage by stage.',
    mode: 'manage',
  },
  {
    eyebrow: 'Songwriting board',
    title: 'Columns for what’s still in progress',
    body: 'New takes land in your Inbox. Add columns as you go, for however you write, like:',
    points: ['Needs a chorus', 'Half the lyrics written', 'All the lyrics written', 'Anything else you want'],
    mode: 'manage',
  },
  {
    eyebrow: 'Songwriting board',
    title: 'Move a song right when it gets better',
    body: 'Nothing expires. When you feel like writing but nothing new is coming, it’s all here waiting. Plenty of the songs people love sat forgotten for years first. This stops yours going missing.',
    mode: 'manage',
  },
]

const LISTEN: Step[] = [
  {
    eyebrow: 'Listen',
    title: 'Listen is for songs further along',
    body: 'A demo ready for a producer, a mix back from one, a master for the label. Make a playlist, give it a cover, keep every version, share it as one link.',
    mode: 'listen',
  },
  {
    eyebrow: 'Listen',
    title: 'Which side does audio go to?',
    body: 'Both sides take files. They’re for different stages:',
    points: [
      'Songwriting board: voice memos and rough takes. They land in your Inbox.',
      'Listen: finished demos, mixes and masters. Drop them onto a playlist or use + Add audio. WAVs, a folder or a zip.',
    ],
    mode: 'listen',
  },
  {
    eyebrow: 'Listen',
    title: 'Keep every version',
    body: 'New mix back? Use Add version on the track, or select two tracks and Join as versions. Switch between v1 and v2 as it plays.',
    mode: 'listen',
  },
  {
    eyebrow: 'Listen',
    title: 'Share it as one link',
    body: 'Anyone can listen and leave notes. No account needed.',
    mode: 'listen',
  },
]

const WRITE_POINTER: Step = {
  eyebrow: 'Listen',
  title: 'Listen is for songs further along',
  body: 'When a song has a proper demo, a mix or a master, it goes in Listen. Switch between Songwriting and Listen at the top.',
  mode: 'listen',
}

const PATH_STEPS: Record<Path, Step[]> = {
  write: [...WRITE, WRITE_POINTER],
  listen: LISTEN,
  both: [...WRITE, ...LISTEN],
}

function closingSteps(home: BoardMode, installed: boolean): Step[] {
  const light = typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  const steps: Step[] = [
    {
      eyebrow: 'Good to know',
      title: 'Dark or light, signal or not',
      body: `Switch between dark and light mode with ${light ? '◑' : '☀'} at the top right. On a phone it’s in the ⋮ menu.`,
      points: [
        'Your songwriting board lives on this device, so it opens and plays without signal once it’s installed.',
        'Listen playlists play offline once you tap Make offline on the playlist.',
        'Help and this guide are in Settings (⚙) whenever you need them.',
      ],
      mode: home,
    },
  ]
  if (!installed) {
    steps.push({
      eyebrow: 'Install',
      title: 'Put songdrafts on your devices',
      body: 'It opens in its own window, like any other app.',
      mode: home,
      extra: 'install',
    })
  }
  return steps
}

function Overlay({ label, onBackdrop, children }: { label: string; onBackdrop: () => void; children: ReactNode }) {
  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="ob-backdrop" aria-label="Close" onClick={onBackdrop} />
      {children}
    </div>
  )
}

interface OnboardingTourProps {
  readOnly?: boolean
}

export function OnboardingTour({ readOnly = false }: OnboardingTourProps) {
  const boardRole = useBoardRole()
  const tourNonce = useUiStore((state) => state.onboardingTourNonce)
  const setBoardMode = useUiStore((state) => state.setBoardMode)
  const { isInstalled } = usePwaInstall()
  const [open, setOpen] = useState(false)
  const [firstRun, setFirstRun] = useState(false)
  const [phase, setPhase] = useState<'steps' | 'import'>('steps')
  const [path, setPath] = useState<Path | null>(null)
  const [step, setStep] = useState(0)

  const start = (isFirst: boolean) => {
    setPath(null)
    setStep(0)
    setPhase('steps')
    setFirstRun(isFirst)
    setOpen(true)
  }

  useEffect(() => {
    if (readOnly || boardRole !== 'owner') return

    let cancelled = false
    void (async () => {
      const complete = await isOnboardingTourComplete()
      if (!cancelled && !complete) start(true)
    })()

    return () => {
      cancelled = true
    }
  }, [readOnly, boardRole])

  // Reopened from Help or Settings: a new nonce. Handled while rendering
  // rather than in an effect, so it opens in the same pass.
  const [seenNonce, setSeenNonce] = useState(tourNonce)
  if (tourNonce !== seenNonce) {
    setSeenNonce(tourNonce)
    if (!readOnly && boardRole === 'owner' && tourNonce !== 0) start(false)
  }

  if (!open) return null

  const finish = async (landOn?: BoardMode) => {
    if (landOn) setBoardMode(landOn)
    await setOnboardingTourComplete()
    setOpen(false)
  }

  if (phase === 'import') {
    return (
      <Overlay label="Getting your audio in" onBackdrop={() => setOpen(false)}>
        <div className="ob-card">
          <p className="ob-eyebrow">One last thing</p>
          <h2 className="ob-title">Getting your audio in</h2>
          <ImportGuide />
          <div className="ob-actions">
            <span />
            <button type="button" className="ob-pill is-primary" onClick={() => setOpen(false)}>
              Let’s go
            </button>
          </div>
        </div>
      </Overlay>
    )
  }

  if (!path) {
    const choose = (next: Path) => {
      setPath(next)
      setBoardMode(next === 'listen' ? 'listen' : 'manage')
    }
    return (
      <Overlay label="Welcome" onBackdrop={() => void finish()}>
        <div className="ob-card is-choice">
          <p className="ob-eyebrow">Welcome to songdrafts</p>
          <h2 className="ob-title">How do you plan to use songdrafts?</h2>
          <div className="ob-choice">
            <button type="button" onClick={() => choose('write')}>
              <strong>Writing songs</strong>
              <span>Organising voice memos and rough takes, to help me finish more songs</span>
            </button>
            <button type="button" onClick={() => choose('listen')}>
              <strong>Listening and sharing</strong>
              <span>Storing, playing and sharing demos, mixes and masters</span>
            </button>
            <button type="button" onClick={() => choose('both')}>
              <strong>Both</strong>
              <span>Finish songs on the board, then share them in Listen</span>
            </button>
          </div>
          <div className="ob-actions">
            {firstRun ? (
              <button
                type="button"
                className="ob-pill is-quiet"
                onClick={() => {
                  snoozeOnboardingTour()
                  setOpen(false)
                }}
              >
                Remind me later
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="ob-pill is-quiet" onClick={() => void finish()}>
              Skip
            </button>
          </div>
        </div>
      </Overlay>
    )
  }

  const home: BoardMode = path === 'listen' ? 'listen' : 'manage'
  const steps = [...PATH_STEPS[path], ...closingSteps(home, isInstalled)]
  const current = steps[step]
  const isLast = step === steps.length - 1

  const next = () => {
    if (isLast) {
      if (firstRun) {
        // Done is saved now, so a reload never replays the tour; the import
        // card is the last thing on screen, not a step to finish.
        setBoardMode(home)
        void setOnboardingTourComplete()
        setPhase('import')
        return
      }
      void finish(home)
      return
    }
    setBoardMode(steps[step + 1].mode)
    setStep((value) => value + 1)
  }

  return (
    <Overlay label="Welcome tour" onBackdrop={() => void finish(home)}>
      <div className="ob-card">
        <button type="button" className="ob-close" aria-label="Close the guide" onClick={() => void finish(home)}>
          ✕
        </button>
        <p className="ob-eyebrow">
          {current.eyebrow} <span className="ob-count">{step + 1} of {steps.length}</span>
        </p>
        <h2 className="ob-title">{current.title}</h2>
        <p className="ob-body">{current.body}</p>
        {current.points && (
          <ul className="ob-points">
            {current.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        {current.extra === 'install' && <InstallGuide />}

        <div className="ob-dots" aria-hidden="true">
          {steps.map((_, index) => (
            <span key={index} className={index === step ? 'is-active' : undefined} />
          ))}
        </div>

        <div className="ob-actions">
          {step > 0 ? (
            <button
              type="button"
              className="ob-pill is-quiet"
              onClick={() => {
                setBoardMode(steps[step - 1].mode)
                setStep((value) => value - 1)
              }}
            >
              Back
            </button>
          ) : (
            <button type="button" className="ob-pill is-quiet" onClick={() => void finish(home)}>
              Skip
            </button>
          )}
          {isLast && !firstRun && (
            <button type="button" className="ob-link" onClick={() => setPhase('import')}>
              How to get audio in
            </button>
          )}
          <button type="button" className="ob-pill is-primary" onClick={next}>
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
