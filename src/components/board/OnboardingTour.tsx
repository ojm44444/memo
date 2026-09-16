import { useEffect, useState } from 'react'
import {
  isOnboardingTourComplete,
  setOnboardingTourComplete,
} from '@/lib/onboarding'
import { useBoardRole } from '@/hooks/useBoardRole'
import { useUiStore, type BoardMode } from '@/stores/uiStore'

/**
 * First run asks one question, then shows the side you came for.
 *
 * 17 Sept, Owen: a friend who only shares mixes should not be walked through
 * a songwriting board first. So the tour opens on a choice, switches the
 * screen behind it to that side, and ends by pointing at the other one.
 */
type Path = 'write' | 'listen'

type Step = { title: string; body: string; mode: BoardMode }

const STEPS: Record<Path, Step[]> = {
  write: [
    { title: 'Everything starts in the Inbox', body: 'Import a folder or drop voice memos in.', mode: 'manage' },
    { title: 'Move a song right when it gets better', body: 'Nothing expires, nothing nags you.', mode: 'manage' },
    {
      title: 'Put every take on the same card',
      body: 'Add a new recording to the song it belongs to, then play them back to back.',
      mode: 'manage',
    },
    {
      title: 'Mixes live in Listen',
      body: 'When demos, mixes and masters come back, make a project and share it as one link.',
      mode: 'listen',
    },
  ],
  listen: [
    { title: 'One project per release', body: 'An EP, a single, a session. Give it a cover.', mode: 'listen' },
    { title: 'Drop the files in', body: 'WAVs, a folder, or the zip as it came. Versions stack up.', mode: 'listen' },
    {
      title: 'Share the project as one link',
      body: 'Anyone can listen and leave notes. No account needed.',
      mode: 'listen',
    },
    {
      title: 'Writing too?',
      body: 'Songwriting is next to Listen at the top: a board for voice memos and rough takes.',
      mode: 'listen',
    },
  ],
}

interface OnboardingTourProps {
  readOnly?: boolean
}

export function OnboardingTour({ readOnly = false }: OnboardingTourProps) {
  const boardRole = useBoardRole()
  const tourNonce = useUiStore((state) => state.onboardingTourNonce)
  const setBoardMode = useUiStore((state) => state.setBoardMode)
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState<Path | null>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (readOnly || boardRole !== 'owner') return

    let cancelled = false
    void (async () => {
      const complete = await isOnboardingTourComplete()
      if (!cancelled && !complete) {
        setPath(null)
        setStep(0)
        setOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [readOnly, boardRole])

  useEffect(() => {
    if (readOnly || boardRole !== 'owner' || tourNonce === 0) return
    setPath(null)
    setStep(0)
    setOpen(true)
  }, [tourNonce, readOnly, boardRole])

  if (!open) return null

  const finish = async (landOn?: BoardMode) => {
    if (landOn) setBoardMode(landOn)
    await setOnboardingTourComplete()
    setOpen(false)
  }

  if (!path) {
    return (
      <div className="onboarding-tour-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
        <button type="button" className="onboarding-tour-backdrop" aria-label="Skip" onClick={() => void finish()} />
        <div className="onboarding-tour-card is-choice">
          <h2 className="onboarding-tour-title">What are you here for?</h2>
          <div className="onboarding-choice">
            <button
              type="button"
              onClick={() => {
                setPath('write')
                setBoardMode('manage')
              }}
            >
              <strong>Writing songs</strong>
              <span>Voice memos and rough takes on a board</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('listen')
                setBoardMode('listen')
              }}
            >
              <strong>Sharing mixes</strong>
              <span>Demos, mixes and masters, sent as one link</span>
            </button>
          </div>
          <div className="onboarding-tour-actions">
            <button type="button" className="onboarding-tour-skip" onClick={() => void finish()}>
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  const steps = STEPS[path]
  const current = steps[step]
  const isLast = step === steps.length - 1
  const home: BoardMode = path === 'listen' ? 'listen' : 'manage'

  const next = () => {
    if (isLast) {
      void finish(home)
      return
    }
    setBoardMode(steps[step + 1].mode)
    setStep((value) => value + 1)
  }

  return (
    <div className="onboarding-tour-overlay" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <button type="button" className="onboarding-tour-backdrop" aria-label="Skip tour" onClick={() => void finish(home)} />
      <div className="onboarding-tour-card">
        <p className="onboarding-tour-step">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="onboarding-tour-title">{current.title}</h2>
        <p className="onboarding-tour-body">{current.body}</p>

        <div className="onboarding-tour-dots" aria-hidden="true">
          {steps.map((_, index) => (
            <span key={index} className={index === step ? 'is-active' : undefined} />
          ))}
        </div>

        <div className="onboarding-tour-actions">
          <button type="button" className="onboarding-tour-skip" onClick={() => void finish(home)}>
            Skip
          </button>
          <button type="button" className="onboarding-tour-next" onClick={next}>
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
