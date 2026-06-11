import { useEffect, useState } from 'react'
import {
  isOnboardingTourComplete,
  setOnboardingTourComplete,
} from '@/lib/onboarding'
import { useBoardRole } from '@/hooks/useBoardRole'
import { useUiStore } from '@/stores/uiStore'

const TOUR_STEPS = [
  {
    title: 'Welcome to mem•',
    body: 'Your songwriting board — see every memo, work on keepers, and share demos from one place.',
  },
  {
    title: 'Import memos',
    body: 'Tap + Import audio in Inbox, or drag files from Finder on Mac. Voice Memos work great on mobile.',
  },
  {
    title: 'Three modes',
    body: 'Manage is your Kanban. Favourites plays your starred songs. Library holds all projects and collaborators.',
  },
  {
    title: 'Organise takes',
    body: 'Drag songs between sections, star favourites, and open a song for versions, tags, and notes.',
  },
  {
    title: 'Share & collaborate',
    body: 'Create password-protected listen links with timestamped feedback. Invite bandmates from Library.',
  },
] as const

interface OnboardingTourProps {
  readOnly?: boolean
}

export function OnboardingTour({ readOnly = false }: OnboardingTourProps) {
  const boardRole = useBoardRole()
  const tourNonce = useUiStore((state) => state.onboardingTourNonce)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (readOnly || boardRole !== 'owner') return

    let cancelled = false
    void (async () => {
      const complete = await isOnboardingTourComplete()
      if (!cancelled && !complete) {
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
    setStep(0)
    setOpen(true)
  }, [tourNonce, readOnly, boardRole])

  if (!open) return null

  const current = TOUR_STEPS[step]
  const isLast = step === TOUR_STEPS.length - 1

  const finish = async () => {
    await setOnboardingTourComplete()
    setOpen(false)
  }

  const skip = () => {
    void finish()
  }

  const next = () => {
    if (isLast) {
      void finish()
      return
    }
    setStep((value) => value + 1)
  }

  return (
    <div className="onboarding-tour-overlay" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <button type="button" className="onboarding-tour-backdrop" aria-label="Skip tour" onClick={skip} />
      <div className="onboarding-tour-card">
        <p className="onboarding-tour-step">
          Step {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="onboarding-tour-title">{current.title}</h2>
        <p className="onboarding-tour-body">{current.body}</p>

        <div className="onboarding-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, index) => (
            <span key={index} className={index === step ? 'is-active' : undefined} />
          ))}
        </div>

        <div className="onboarding-tour-actions">
          <button type="button" className="onboarding-tour-skip" onClick={skip}>
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
