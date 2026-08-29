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
 * Interpolation is in OKLab. sRGB interpolation through teal to green passes
 * through a muddy middle; OKLab keeps the climb even.
 *
 * Colour carries meaning up to six columns (gaps hold at ~0.043 lightness).
 * Beyond that the gaps fall under the ~0.035 discrimination threshold, so it
 * keeps interpolating to avoid a broken look, but position and the label carry
 * the meaning and colour only supports it.
 */
const STOPS = ['--stage-inbox', '--stage-ideas', '--stage-half', '--stage-done'] as const

export function stageColorAt(index: number, total: number): string {
  if (total <= 1 || index <= 0) return `var(${STOPS[0]})`
  if (index >= total - 1) return `var(${STOPS[STOPS.length - 1]})`

  const p = index / (total - 1)
  const seg = p * (STOPS.length - 1)
  const i = Math.min(Math.floor(seg), STOPS.length - 2)
  const t = seg - i
  if (t < 0.001) return `var(${STOPS[i]})`

  return `color-mix(in oklab, var(${STOPS[i]}) ${Math.round((1 - t) * 100)}%, var(${STOPS[i + 1]}))`
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
