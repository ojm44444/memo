import { INBOX_SLUG } from '@/types/column'

/**
 * The stage ramp: cold to alive as a song moves right across the board.
 *
 * Derived from a column's POSITION, not its name. The previous version matched
 * hardcoded slugs and sent everything unrecognised to a single fallback, so on
 * a real board with renamed sections the ramp collapsed: five of six columns
 * rendered the same colour. Renaming sections is a shipped feature, so the
 * name was never a safe key. Position is what the ramp actually means.
 *
 * Board columns use their own five-stop ramp (18 Sept, Owen: the columns
 * "sort of blur together"). The four brand stage tokens were all teal-to-green
 * and separated mostly on lightness, so neighbouring columns read as one
 * colour. The board ramp walks the wheel instead, cold to warm: blue, sky,
 * teal, lime, gold. Its values live in board-polish.css (both themes), with
 * the brand tokens as the fallback wherever that file is not loaded.
 *
 * Interpolation is in OKLCH so an in-between column keeps its saturation
 * rather than going muddy the way sRGB or OKLab mixes do across hues.
 */
const STOPS = [
  'var(--board-stage-1, var(--stage-inbox))',
  'var(--board-stage-2, var(--stage-inbox))',
  'var(--board-stage-3, var(--stage-ideas))',
  'var(--board-stage-4, var(--stage-half))',
  'var(--board-stage-5, var(--stage-done))',
] as const

export function stageColorAt(index: number, total: number): string {
  if (total <= 1 || index <= 0) return STOPS[0]
  if (index >= total - 1) return STOPS[STOPS.length - 1]

  const p = index / (total - 1)
  const seg = p * (STOPS.length - 1)
  const i = Math.min(Math.floor(seg), STOPS.length - 2)
  const t = seg - i
  if (t < 0.001) return STOPS[i]

  return `color-mix(in oklch, ${STOPS[i]} ${Math.round((1 - t) * 100)}%, ${STOPS[i + 1]})`
}

/**
 * Slug-based fallback for surfaces with no board context — the share page gets
 * a column_slug from the share payload and never sees the board it came from.
 * Inside the app, prefer the inherited --stage-ink that KanbanColumn sets.
 */
export function stageColorVar(columnSlug: string | null | undefined): string {
  switch (columnSlug) {
    case INBOX_SLUG:
      return 'var(--stage-inbox)'
    case 'ideas':
      return 'var(--stage-ideas)'
    case 'half-finished':
      return 'var(--stage-half)'
    case 'finished-demos':
    case 'released':
      return 'var(--stage-done)'
    default:
      return 'var(--stage-ideas)'
  }
}
