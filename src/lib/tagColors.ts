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
 * Tags are quiet tinted pills, not rainbow gradients — one hue per tag,
 * rendered as a soft tint that adapts to light/dark via CSS (`--tag-h`).
 * Distinguishable at a glance without shouting over the one-accent brand.
 */
const PRESET_HUES = [
  18,  // Riff — clay
  335, // Vocal idea — rose
  210, // Chorus — blue
  150, // Verse — green
  38,  // Bridge — amber
  226, // Instrumental — indigo
  185, // Inspiration — teal
  145, // Full idea — emerald
  82,  // Lyrics drafted — olive
  165, // Lyrics finished — sea green
]

function hashStr(s: string): number {
  let h = 0
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function getTagHue(tag: string): number {
  const idx = PRESET_TAGS.findIndex((p) => p.toLowerCase() === tag.toLowerCase())
  if (idx >= 0) return PRESET_HUES[idx]
  return PRESET_HUES[hashStr(tag) % PRESET_HUES.length]
}

/** Inline style helper: sets the hue custom property the pill CSS reads. */
export function tagHueStyle(tag: string): React.CSSProperties {
  return { '--tag-h': getTagHue(tag) } as React.CSSProperties
}
