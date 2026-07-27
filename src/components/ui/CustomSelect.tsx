import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
  popoverClassName?: string
}

export function CustomSelect({ value, options, onChange, className, popoverClassName }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('custom-select', className)}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select-value">{current?.label ?? value}</span>
        <span className={cn('custom-select-chevron', open && 'custom-select-chevron--open')}>›</span>
      </button>
      {open && (
        <div className={cn('custom-select-popover', popoverClassName)} role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={cn('custom-select-option', opt.value === value && 'custom-select-option--active')}
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
              {opt.value === value && <span className="custom-select-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
