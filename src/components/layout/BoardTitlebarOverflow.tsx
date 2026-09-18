import { useEffect, useRef, useState, type ReactNode } from 'react'

export function BoardTitlebarOverflow({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
    }

    const onPointerDown = (event: MouseEvent) => {
      const node = panelRef.current
      if (!node || node.contains(event.target as Node)) return
      setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [open])

  return (
    <div className="board-filter-menu" ref={panelRef}>
      <button
        type="button"
        className="board-filter-trigger board-titlebar-overflow-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="More"
      >
        &#8942;
      </button>

      {open && (
        <div className="board-filter-panel board-titlebar-overflow-panel">
          {children}
        </div>
      )}
    </div>
  )
}
