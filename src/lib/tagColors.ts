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
 * Tags carry FOUR hues, not ten, and all four come from the stage ramp that is
 * already on screen beside them.
 *
 * The previous version gave every preset its own hue: clay, rose, blue, green,
 * amber, indigo, teal, emerald, olive, sea green. Ten hues across the whole
 * wheel, in an identity whose whole rule is one accent. On a real drawer that
 * tag row was the loudest thing on the page and it was decorating, not
 * informing, because the colours carried no meaning: "Riff" being clay and
 * "Bridge" being amber tells you nothing.
 *
 * Colour now encodes the one thing about a tag worth encoding at a glance,
 * which is what KIND of tag it is:
 *
 *   where in the song   Chorus, Verse, Bridge, Instrumental
 *   what kind of idea   Riff, Vocal idea, Inspiration, Full idea
 *   how far the words   Lyrics drafted, Lyrics finished
 *   yours               anything you typed
 *
 * Four groups, four hues, drawn from the blue-to-lime ramp so the pills belong
 * to the board instead of sitting on top of it.
 */
const HUE_SECTION = 206 // where in the song, the ramp's blue end
const HUE_IDEA = 173    // what kind of idea, teal
const HUE_LYRICS = 78   // how far the words got, the ramp's lime end
const HUE_CUSTOM = 137  // yours, the ramp's green middle

const TAG_GROUPS: Record<string, number> = {
  'chorus': HUE_SECTION,
  'verse': HUE_SECTION,
  'bridge': HUE_SECTION,
  'instrumental': HUE_SECTION,
  'riff': HUE_IDEA,
  'vocal idea': HUE_IDEA,
  'inspiration': HUE_IDEA,
  'full idea': HUE_IDEA,
  'lyrics drafted': HUE_LYRICS,
  'lyrics finished': HUE_LYRICS,
}

export function getTagHue(tag: string): number {
  const known = TAG_GROUPS[tag.trim().toLowerCase()]
  if (known !== undefined) return known
  // A tag someone typed themselves. "lyrics started" should not be a different
  // colour from "Lyrics drafted" just because it missed the preset list, so
  // anything whose words place it in a group joins that group.
  const t = tag.toLowerCase()
  if (t.includes('lyric') || t.includes('words')) return HUE_LYRICS
  if (t.includes('chorus') || t.includes('verse') || t.includes('bridge') || t.includes('intro') || t.includes('outro') || t.includes('solo')) return HUE_SECTION
  if (t.includes('idea') || t.includes('riff') || t.includes('hook')) return HUE_IDEA
  return HUE_CUSTOM
}

/** Inline style helper: sets the hue custom property the pill CSS reads. */
export function tagHueStyle(tag: string): React.CSSProperties {
  return { '--tag-h': getTagHue(tag) } as React.CSSProperties
}
