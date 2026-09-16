import { useEffect, useRef, useState } from 'react'

/**
 * Pieces shared by the two record-shaped screens: Listen in the app, and the
 * page a label opens. They should look like the same product, because they
 * are the two ends of the same handover.
 */

function hashSeed(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Generated artwork: the stage ramp turned by a seed, with the mark's four bars. */
export function RecordArt({ seed, label, className }: { seed: string; label: string; className?: string }) {
  const h = hashSeed(seed)
  const angle = 110 + (h % 140)
  const bars = [0.5, 0.78, 0.62, 0.95].map((b, i) => Math.max(0.45, b - ((h >> (i * 4)) & 15) / 90))
  return (
    <div
      className={`rec-art${className ? ` ${className}` : ''}`}
      style={{ ['--rec-angle' as string]: `${angle}deg` }}
      role="img"
      aria-label={label}
    >
      <div className="rec-art-bars" aria-hidden>
        {bars.map((height, i) => (
          <span key={i} style={{ height: `${Math.round(height * 100)}%` }} />
        ))}
      </div>
    </div>
  )
}

/** A small menu anchored to its trigger. Closes on outside click and Escape. */
export function RecordMenu({
  trigger,
  label,
  children,
  align = 'end',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode
  label: string
  children: (close: () => void) => React.ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="rec-menu-wrap" ref={ref} data-drawer-layer="menu">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className={`rec-menu is-${align}`} role="menu" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
