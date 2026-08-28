import { cn } from '@/lib/cn'

/**
 * THE wordmark, everywhere. One image from the pack, never rebuilt from text.
 *
 * The live-text reconstruction (s<mark/>ngdrafts) rendered as three pieces
 * with gaps: an inline SVG carries its own advance width plus whitespace, and
 * its size is set independently of the font, so it can never match the o's
 * x-height. The pack ships outlined paths precisely so spacing and disc size
 * are baked in and cannot drift. Theme-aware: paper letterforms on dark
 * grounds, ink on light, both rendered and toggled in CSS.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('wordmark-img', className)}>
      <img src="/brand/wordmark-paper.svg" alt="songdrafts" className="wm-on-dark" decoding="async" />
      <img src="/brand/wordmark-ink.svg" alt="" aria-hidden className="wm-on-light" decoding="async" />
    </span>
  )
}

/**
 * Hero-scale lockup (footer sign-off etc.), explicit tone.
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
