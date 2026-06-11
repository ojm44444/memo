import { useEffect, useRef, useState } from 'react'

interface LibrarySearchProps {
  value: string
  onChange: (value: string) => void
}

export function LibrarySearch({ value, onChange }: LibrarySearchProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const timer = window.setTimeout(() => onChange(draft), 250)
    return () => window.clearTimeout(timer)
  }, [draft, onChange])

  return (
    <label className="library-search">
      <span className="library-search-icon" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        type="search"
        className="library-search-input"
        placeholder="Search projects and songs"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Search library"
      />
      {draft && (
        <button
          type="button"
          className="library-search-clear"
          aria-label="Clear library search"
          onClick={() => {
            setDraft('')
            onChange('')
            inputRef.current?.focus()
          }}
        >
          ✕
        </button>
      )}
    </label>
  )
}
