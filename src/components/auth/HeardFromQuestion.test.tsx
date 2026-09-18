import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { HeardFromQuestion } from './HeardFromQuestion'
import {
  getHeardFrom,
  heardFromChosen,
  setHeardFrom,
  type HeardFrom,
  type HeardFromValue,
} from '@/lib/attribution'

/** The Create account page in miniature: the question, then a button that
 *  only works once a choice is made. */
function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const [value, setValue] = useState<HeardFromValue | null>(null)
  const [other, setOther] = useState('')
  const choose = (next: HeardFrom | null) => {
    setValue(next?.source ?? null)
    setHeardFrom(next)
  }
  return (
    <>
      <HeardFromQuestion
        value={value}
        other={other}
        onChange={choose}
        onOtherChange={(text) => {
          setOther(text)
          if (value === 'other') setHeardFrom({ source: 'other', other: text })
        }}
      />
      <button type="button" disabled={!heardFromChosen(value)} onClick={onSubmit}>
        Create account
      </button>
    </>
  )
}

describe('how did you hear about songdrafts', () => {
  it('holds the buttons until one is picked, and stores the answer', () => {
    localStorage.clear()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    const submit = screen.getByRole('button', { name: 'Create account' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reddit' }))
    expect(getHeardFrom()).toEqual({ source: 'reddit', other: undefined })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('shows the free text field for Other only, and keeps what is typed', () => {
    localStorage.clear()
    render(<Harness />)
    expect(screen.queryByLabelText('Where you heard about songdrafts')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Other' }))
    const field = screen.getByLabelText('Where you heard about songdrafts')
    fireEvent.change(field, { target: { value: 'a podcast' } })
    expect(getHeardFrom()).toEqual({ source: 'other', other: 'a podcast' })

    // Tapping the chosen pill again clears it, and the buttons lock back up.
    fireEvent.click(screen.getByRole('button', { name: 'Other' }))
    expect(getHeardFrom()).toBeNull()
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
  })
})
