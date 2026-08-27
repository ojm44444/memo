import { cn } from '@/lib/cn'

/**
 * The songdrafts mark: a waveform in a circle, the four bars walking the stage
 * ramp cold to alive. Geometry matches the official pack in public/brand
 * (mark-only.svg), redrawn inline so it can theme and does not cost a request.
 *
 * The bars use the ramp tokens, so the mark re-tints itself in mist rather
 * than needing a second file. The disc stays slate in both themes: it is the
 * thing that stops this reading as a black square with a green blob at 16px.
 */
export function WordmarkMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1000 1000"
      fill="none"
      className={cn('wordmark-mark', className)}
      aria-hidden
    >
      {/*
        The pack's #1b333d disc measures 11.14:1 on mist and 1.04:1 on the
        slate nav — invisible on dark, so the mark read as floating bars in a
        gap where the "o" should be. The disc is theme-aware here: it exists
        to separate the bars from whatever is behind them.
      */}
      <circle cx="500" cy="500" r="310" fill="var(--mark-disc)" />
      <rect x="306.7" y="423.4" width="66.7" height="153.3" rx="33.3" fill="var(--mark-bar-1)" />
      <rect x="413.4" y="360.0" width="66.7" height="279.9" rx="33.3" fill="var(--mark-bar-2)" />
      <rect x="520.0" y="406.7" width="66.7" height="186.6" rx="33.3" fill="var(--mark-bar-3)" />
      <rect x="626.6" y="333.4" width="66.7" height="333.2" rx="33.3" fill="var(--mark-bar-4)" />
    </svg>
  )
}

/**
 * Full lockup for hero-scale moments, from the official pack.
 *
 * The letterforms are paths, not live text, so the wordmark never depends on
 * Instrument Serif having loaded and never reflows. Use this where the mark is
 * the subject; use the inline `s<WordmarkMark />ngdrafts` treatment in bars and
 * headers where it sits alongside UI text.
 */
export function WordmarkLockup({
  className,
  tone = 'ink',
}: {
  className?: string
  /** ink = dark letterforms (mist backgrounds); paper = light (slate backgrounds) */
  tone?: 'ink' | 'paper'
}) {
  return (
    <img
      src={`/brand/wordmark-${tone}.svg`}
      alt="songdrafts"
      className={cn('wordmark-lockup', className)}
      width={586}
      height={124}
      decoding="async"
    />
  )
}
