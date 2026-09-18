import { useId, useRef } from 'react'
import '@/styles/listeners.css'

/**
 * "Your name (optional)" on a share page. Never needed to play. Saved on this
 * device with the comment name, and sent with opens and plays so whoever sent
 * the link can see who listened. onCommit fires when the listener leaves the
 * field or presses Enter, with the trimmed name, only if it changed.
 */
export function ListenerNameField({
  value,
  onChange,
  onCommit,
}: {
  value: string
  onChange: (name: string) => void
  onCommit: (name: string) => void
}) {
  const id = useId()
  const committed = useRef(value.trim())

  const commit = () => {
    const name = value.trim()
    if (!name || name === committed.current) return
    committed.current = name
    onCommit(name)
  }

  return (
    <div className="listener-name">
      <label htmlFor={id} className="listener-name-label">
        Your name (optional), so they know who listened
      </label>
      <input
        id={id}
        type="text"
        className="listener-name-input"
        value={value}
        maxLength={60}
        autoComplete="name"
        placeholder="Your name"
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
