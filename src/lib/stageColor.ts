import { INBOX_SLUG } from '@/types/column'

/**
 * The stage ramp: cold to alive as a song moves right across the board.
 *
 * Returns a CSS custom property reference, so the value resolves per theme
 * (see tokens.css) rather than being baked in at call time.
 *
 * Used for column header rules and counts, card left edges, and waveform ink.
 * Never for fills, never for body text.
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
      // Custom sections the user added sit mid-ramp rather than inventing a
      // new hue, which would break the cold-to-alive reading.
      return 'var(--stage-ideas)'
  }
}
