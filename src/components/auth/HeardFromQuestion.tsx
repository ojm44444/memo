/**
 * "How did you hear about songdrafts?" on the Create account page.
 *
 * One tap, above the buttons, required before either button works: this is
 * the number Owen plans off, and most Reddit traffic carries no UTM. The
 * answer is kept in this browser straight away (lib/attribution), so it
 * survives the Google round trip and the magic link, and is written to the
 * account once the session appears.
 */

import { HEARD_FROM_OPTIONS, type HeardFrom, type HeardFromValue } from '@/lib/attribution'

export type HeardFromQuestionProps = {
  value: HeardFromValue | null
  other: string
  onChange: (next: HeardFrom | null) => void
  onOtherChange: (text: string) => void
  disabled?: boolean
}

export function HeardFromQuestion({
  value,
  other,
  onChange,
  onOtherChange,
  disabled,
}: HeardFromQuestionProps) {
  return (
    <div className="sign-in-heard">
      <p className="sign-in-heard-q" id="heard-from-label">
        How did you hear about songdrafts?
      </p>
      <div className="sign-in-heard-pills" role="group" aria-labelledby="heard-from-label">
        {HEARD_FROM_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`sign-in-pill${value === option.value ? ' is-on' : ''}`}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() =>
              onChange(
                value === option.value
                  ? null
                  : { source: option.value, other: option.value === 'other' ? other : undefined },
              )
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      {value === 'other' && (
        <input
          type="text"
          className="sign-in-input sign-in-heard-other"
          placeholder="Where from?"
          aria-label="Where you heard about songdrafts"
          maxLength={120}
          value={other}
          disabled={disabled}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      )}
    </div>
  )
}
