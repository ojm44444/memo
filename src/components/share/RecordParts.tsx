import { useEffect, useRef, useState } from 'react'
import { COVER_PALETTES, coverBars, coverAngle, hashSeed } from '@/lib/generatedCover'

/**
 * Pieces shared by the two record-shaped screens: Listen in the app, and the
 * page a label opens. They should look like the same product, because they
 * are the two ends of the same handover.
 */

export function RecordArt({
  seed,
  label,
  className,
  src,
  variant,
}: {
  /** Pick the palette by position instead of by seed. */
  variant?: number
  seed: string
  label: string
  className?: string
  /** A real cover. The generated art shows until (and unless) it loads. */
  src?: string | null
}) {
  const h = hashSeed(seed)
  const [a, b, c] = COVER_PALETTES[Math.abs(variant ?? h) % COVER_PALETTES.length]
  const angle = coverAngle(h)
  const bars = coverBars(h)
  return (
    <div
      className={`rec-art${className ? ` ${className}` : ''}`}
      style={{
        ['--rec-angle' as string]: `${angle}deg`,
        ['--rec-a' as string]: a,
        ['--rec-b' as string]: b,
        ['--rec-c' as string]: c,
      }}
      role="img"
      aria-label={label}
    >
      <div className="rec-art-bars" aria-hidden>
        {bars.map((height, i) => (
          <span key={i} style={{ height: `${Math.round(height * 100)}%` }} />
        ))}
      </div>
      {src && <img className="rec-art-img" src={src} alt="" draggable={false} />}
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
