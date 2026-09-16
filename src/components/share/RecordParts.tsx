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
/* Every generated cover is different, all in the brand's sea-to-mint family,
   but far enough apart to tell playlists apart at a glance (17 Sept). Given
   a `variant` (a playlist's place in the grid) neighbours never match. */
const COVER_PALETTES: [string, string, string][] = [
  ['#1f5f6b', '#51a0a9', '#bbe6b8'], // sea
  ['#0e2a3a', '#2f6f9e', '#8ed2b2'], // night
  ['#3f8f73', '#8fcf9a', '#e3f2b8'], // lime
  ['#0d1f27', '#1f5f6b', '#66baaf'], // deep
  ['#24507a', '#4f9bb8', '#bfe6dc'], // ocean
  ['#274b3a', '#5c9a73', '#c9e8b8'], // moss
  ['#1d3b4f', '#6a8fa8', '#d6e9df'], // dusk
  ['#2f7f8a', '#8ed2b2', '#f1f7da'], // glass
]

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
  const angle = 110 + (h % 140)
  const bars = [0.5, 0.78, 0.62, 0.95].map((b, i) => Math.max(0.45, b - ((h >> (i * 4)) & 15) / 90))
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
