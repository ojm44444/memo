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
/**
 * Small sizes get a differently drawn mark, not a scaled one.
 *
 * The nav renders this at 131 x 22px. Measured at that size the detailed
 * wordmark's four bars come out 1.51px wide with 0.91px between them, and a
 * sub-pixel gap does not survive antialiasing: the four bars merge into a
 * textured dot, so the one ownable element in the mark disappears exactly
 * where the mark is seen most.
 *
 * The small variant carries three bars at 2.23px with 1.45px gaps, in the same
 * circle at the same position, so the lockup's proportions do not shift. Three
 * thick bars that read beat four thin ones that do not. The ramp survives the
 * dropped bar by taking the cold end, the middle and the green end, so the
 * mark still says cold-to-finished.
 *
 * `size` is about legibility, not scale: pass "lg" anywhere the mark renders
 * above roughly 200px wide, where the fourth bar has room to exist again.
 */
export function Wordmark({
  className,
  size = 'sm',
}: {
  className?: string
  size?: 'sm' | 'lg'
}) {
  const suffix = size === 'sm' ? '-sm' : ''
  return (
    <span className={cn('wordmark-img', className)}>
      <img
        src={`/brand/wordmark-paper${suffix}.svg`}
        alt="songdrafts"
        className="wm-on-dark"
        decoding="async"
      />
      <img
        src={`/brand/wordmark-ink${suffix}.svg`}
        alt=""
        aria-hidden
        className="wm-on-light"
        decoding="async"
      />
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
