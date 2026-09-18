import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTitleSearchFilter, setTitleSearchFilter } from '@/db/repositories/projectRepo'

export function BoardSearch() {
  const activeQuery = useLiveQuery(() => getTitleSearchFilter(), [])
  const [draft, setDraft] = useState('')
  // Phone: the collapsed icon opens into a full-width field across the top
  // bar while focused. Tracked in state so the close button can hang off it.
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(activeQuery ?? '')
  }, [activeQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void setTitleSearchFilter(draft)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }

      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        setDraft('')
        void setTitleSearchFilter('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const clear = () => {
    setDraft('')
    void setTitleSearchFilter('')
    inputRef.current?.focus()
  }

  const close = () => {
    setDraft('')
    void setTitleSearchFilter('')
    inputRef.current?.blur()
  }

  return (
    <label
      className={[
        'board-search',
        focused && 'is-open',
        !focused && draft && 'has-query',
      ].filter(Boolean).join(' ')}
    >
      <span className="board-search-icon" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        type="search"
        className="board-search-input"
        placeholder="Search songs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Search songs"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // A short grace period so a tap on Cancel still lands on touch
          // browsers that blur before the click.
          window.setTimeout(() => {
            if (document.activeElement !== inputRef.current) setFocused(false)
          }, 150)
        }}
      />
      {draft && (
        <button type="button" className="board-search-clear" onClick={clear} aria-label="Clear search">
          ✕
        </button>
      )}
      <kbd className="board-search-kbd">⌘K</kbd>
      {/* Phone only (CSS): a plain way out of the full-width field. Pressing
          it must not blur the input first, or the field would close before
          the click lands. */}
      <button
        type="button"
        className="board-search-close"
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
      >
        Cancel
      </button>
    </label>
  )
}
