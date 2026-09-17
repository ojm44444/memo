import { useEffect, useState } from 'react'
import {
  isOnboardingTourComplete,
  setOnboardingTourComplete,
  snoozeOnboardingTour,
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
type Path = 'write' | 'listen' | 'both'

type Step = { title: string; body: string; points?: string[]; mode: BoardMode }

/* Owen's script, 17 Sept. */
const BASE: Record<'write' | 'listen', Step[]> = {
  write: [
    {
      title: 'Your songwriting board',
      body: 'A pipeline that moves each song from stage to stage. Merge cards when new ideas belong to the same song, so you always know:',
      points: ['what is still a work in progress', 'what needs its chords finished', 'what is waiting in your DAW'],
      mode: 'manage',
    },
    { title: 'Move a song right when it gets better', body: 'Nothing expires. Nothing nags you.', mode: 'manage' },
    {
      title: 'Listen is for songs further down the line',
      body: 'Demos, mixes and masters in playlists. Drop audio in, and share a playlist as one link.',
      mode: 'listen',
    },
  ],
  listen: [
    { title: 'Make a playlist', body: 'An EP, a single, songs for a label. Give it a cover.', mode: 'listen' },
    { title: 'Drop audio in', body: 'Each file becomes a track. WAVs, a folder or a zip.', mode: 'listen' },
    {
      title: 'Versions',
      body: 'Select two tracks and Join as versions, or use Add version on a track. Switch between v1 and v2 as it plays.',
      mode: 'listen',
    },
    { title: 'Share it as one link', body: 'Anyone can listen and leave notes. No account needed.', mode: 'listen' },
  ],
}

const STEPS: Record<Path, Step[]> = {
  ...BASE,
  // Both: the board first, then everything about Listen.
  both: [...BASE.write.slice(0, 2), ...BASE.listen],
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
          <h2 className="onboarding-tour-title">Welcome to songdrafts</h2>
          <p className="onboarding-tour-body">
            The new home for your songwriting: works in progress, mixes and masters. What are you here for first?
          </p>
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
              <strong>Listening and sharing</strong>
              <span>Demos, mixes and masters in playlists</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPath('both')
                setBoardMode('manage')
              }}
            >
              <strong>Both</strong>
              <span>Write on the board, share in Listen</span>
            </button>
          </div>
          <div className="onboarding-tour-actions">
            <button
              type="button"
              className="onboarding-tour-skip"
              onClick={() => {
                snoozeOnboardingTour()
                setOpen(false)
              }}
            >
              Remind me later
            </button>
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
        {current.points && (
          <ul className="onboarding-tour-points">
            {current.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}

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
