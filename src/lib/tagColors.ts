export const PRESET_TAGS = [
  'Riff',
  'Vocal idea',
  'Chorus',
  'Verse',
  'Bridge',
  'Instrumental',
  'Inspiration',
  'Full idea',
  'Lyrics drafted',
  'Lyrics finished',
] as const

/**
 * Every tag gets its own colour (18 Sept, Owen: "the tags should be different
 * colours when you tag them, and that should be more evident").
 *
 * The previous version grouped ten presets into four hues from the stage
 * ramp, so on a real board Chorus, Verse and Bridge all rendered the same
 * blue and most chips read as one green-grey. Tags now spread around the
 * whole wheel, spaced roughly 36 degrees apart so neighbours never blur.
 *
 * Tags you type yourself hash onto the same wheel, so a custom tag keeps one
 * colour everywhere it appears (card, panel, filter) without being stored.
 */
const PRESET_HUES: Record<string, number> = {
  'riff': 22,             // orange
  'bridge': 46,           // amber
  'lyrics drafted': 72,   // yellow-lime
  'full idea': 112,       // green
  'lyrics finished': 150, // emerald
  'instrumental': 182,    // cyan
  'chorus': 208,          // sky blue
  'verse': 244,           // indigo
  'inspiration': 282,     // violet
  'vocal idea': 322,      // pink
}

/** Twelve evenly spaced hues for tags that are not presets. */
const CUSTOM_HUES = [8, 38, 64, 96, 128, 162, 194, 222, 256, 290, 312, 338]

function hashTag(tag: string): number {
  let h = 2166136261
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619)
  return h >>> 0
}

export function getTagHue(tag: string): number {
  const key = tag.trim().toLowerCase()
  const known = PRESET_HUES[key]
  if (known !== undefined) return known
  return CUSTOM_HUES[hashTag(key) % CUSTOM_HUES.length]
}

/** Inline style helper: sets the hue custom property the pill CSS reads. */
export function tagHueStyle(tag: string): React.CSSProperties {
  return { '--tag-h': getTagHue(tag) } as React.CSSProperties
}
