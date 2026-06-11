export type ProjectAccentPreset = {
  label: string
  hue: number
}

export const PROJECT_ACCENT_PRESETS: ProjectAccentPreset[] = [
  { label: 'Coral', hue: 12 },
  { label: 'Amber', hue: 38 },
  { label: 'Lime', hue: 95 },
  { label: 'Mint', hue: 158 },
  { label: 'Sky', hue: 205 },
  { label: 'Violet', hue: 265 },
  { label: 'Rose', hue: 330 },
]

export function hashProjectHue(projectId: string) {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

/** Deterministic accent gradient from project id, or a chosen hue. */
export function projectAccentStyle(projectId: string, accentHue?: number | null): { background: string } {
  const hue = accentHue ?? hashProjectHue(projectId)
  const hue2 = (hue + 42) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 62% 42%) 0%, hsl(${hue2} 58% 32%) 100%)`,
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
