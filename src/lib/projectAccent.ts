export type ProjectAccentPreset = {
  label: string
  hue: number
}

/**
 * Project accents live inside the identity's hue band, roughly 110-200:
 * the same slate-to-green water the stage ramp runs through.
 *
 * These used to span the full wheel (coral, violet, rose), so a project could
 * render hot pink next to a locked slate/green identity. A project accent is
 * a wayfinding tint, not a second brand.
 */
export const PROJECT_ACCENT_PRESETS: ProjectAccentPreset[] = [
  { label: 'Spring', hue: 118 },
  { label: 'Sage', hue: 140 },
  { label: 'Sea', hue: 158 },
  { label: 'Teal', hue: 176 },
  { label: 'Slate', hue: 194 },
]

/** The identity band. Anything outside it is not ours. */
const HUE_MIN = 110
const HUE_SPAN = 90

export function hashProjectHue(projectId: string) {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return HUE_MIN + (Math.abs(hash) % HUE_SPAN)
}

/** Deterministic flat accent tint from project id, or a chosen hue. */
export function projectAccentStyle(projectId: string, accentHue?: number | null): { background: string } {
  const hue = accentHue ?? hashProjectHue(projectId)
  return {
    // Flat, not a gradient. Gradients are rationed to the playing card /
    // player bar, the share hero and the landing hero; a grid of generated
    // gradient tiles is the Samply library look the identity rules out.
    background: `hsl(${hue} 46% 34%)`,
  }
}

export function projectAccentSwatchStyle(hue: number): { background: string } {
  return { background: `hsl(${hue} 62% 42%)` }
}

/** Accent underline for listen mode header. */
export function listenViewAccentStyle(
  projectId: string,
  accentHue?: number | null,
): Record<string, string> {
  const hue = accentHue ?? hashProjectHue(projectId)
  return { '--listen-view-accent': `hsl(${hue} 62% 48%)` }
}

/** Accent underline for an active kanban column header. */
export function columnHeaderAccentStyle(
  projectId: string,
  accentHue?: number | null,
): Record<string, string> {
  const hue = accentHue ?? hashProjectHue(projectId)
  return { '--column-header-accent': `hsl(${hue} 62% 48%)` }
}

/** Accent underline for library mode header. */
export function libraryViewAccentStyle(
  projectId: string,
  accentHue?: number | null,
): Record<string, string> {
  const hue = accentHue ?? hashProjectHue(projectId)
  return { '--library-view-accent': `hsl(${hue} 62% 48%)` }
}

/** Tint text to match a project accent hue. */
export function projectAccentTextStyle(
  projectId: string,
  accentHue?: number | null,
): { color: string } {
  const hue = accentHue ?? hashProjectHue(projectId)
  return { color: `hsl(${hue} 62% 62%)` }
}

/** Left accent stripe for library project cards. */
export function libraryCardAccentStyle(
  projectId: string,
  accentHue?: number | null,
): Record<string, string> {
  const hue = accentHue ?? hashProjectHue(projectId)
  const accent = `hsl(${hue} 62% 48%)`
  return {
    '--library-card-accent': accent,
    '--library-card-accent-muted': `hsl(${hue} 62% 48% / 0.32)`,
    '--library-card-accent-border': `hsl(${hue} 62% 48% / 0.5)`,
    '--library-card-accent-glow': `hsl(${hue} 62% 48% / 0.22)`,
  }
}

/** Accent stripe + tinted border for the board frame. */
export function boardFrameAccentStyle(
  projectId: string,
  accentHue?: number | null,
): { '--board-frame-accent': string; borderColor: string; boxShadow: string } {
  const hue = accentHue ?? hashProjectHue(projectId)
  const accent = `hsl(${hue} 62% 48%)`
  return {
    '--board-frame-accent': accent,
    borderColor: `hsl(${hue} 50% 35% / 0.4)`,
    boxShadow: `0 40px 80px rgba(0, 0, 0, 0.45), inset 0 3px 0 ${accent}`,
  }
}
