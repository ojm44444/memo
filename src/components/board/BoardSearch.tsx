import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTitleSearchFilter, setTitleSearchFilter } from '@/db/repositories/projectRepo'

export function BoardSearch() {
  const activeQuery = useLiveQuery(() => getTitleSearchFilter(), [])
  const [draft, setDraft] = useState('')
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

  return (
    <label className="board-search">
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
      />
      {draft && (
        <button type="button" className="board-search-clear" onClick={clear} aria-label="Clear search">
          ✕
        </button>
      )}
      <kbd className="board-search-kbd">⌘K</kbd>
    </label>
  )
}
