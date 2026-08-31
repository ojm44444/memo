/**
 * Spotting a title nobody chose.
 *
 * A memo called "New Recording 612" or "11" is not named, it is numbered by
 * whatever recorded it, and a board full of those is the problem songdrafts
 * exists to fix. Detecting them is what lets a card offer to rename itself.
 *
 * This file used to also GENERATE a name, offering "Call it Tiny Umbrella?" on
 * every untitled card. The research behind it was real, but the execution was
 * not: at the scale of an actual inbox it was a hundred and fifty pieces of
 * nonsense competing for attention, and it read as the app being funny about
 * work someone cared about. The nudge stayed, the invented names went.
 */
/**
 * Does this title look like an untitled file rather than something a person
 * chose? Only those get a suggestion; a name someone typed is never touched.
 */
export function looksUnnamed(title: string): boolean {
  const t = title.trim()
  if (!t) return true
  return (
    /^new recording/i.test(t) ||
    /^(untitled|audio|voice ?memo|recording|track|memo)\b/i.test(t) ||
    /^img[\s_-]?\d+$/i.test(t) ||
    // "31:01:2025, 21:34" and friends: a date is a filename, not a name.
    /^[\d\s:,._-]+$/.test(t)
  )
}

/**
 * Strip a trailing counter: "Northgate Rehearsal Rooms 14" -> "The Good
 * Rehearsal Rooms". Used to spot iOS location auto-names in bulk.
 */
function stemOf(title: string): string {
  return title.trim().replace(/\s+\d+$/, '').trim().toLowerCase()
}

/**
 * iOS names a voice memo after where you were standing, then appends a
 * counter: "Northgate Rehearsal Rooms 2" through "14", "14 Kiln Lane 6",
 * "Pinefield Business Park 18". A real library is mostly these.
 *
 * No regex can tell "The Anchor Inn" from a title someone chose, because in
 * isolation it IS one. The tell is repetition: nobody writes eight songs and
 * calls them all the same place with a number on the end. So the judgement has
 * to be made across the whole library, not per card.
 *
 * Three or more sharing a stem is the threshold. Two is a coincidence a real
 * title could produce ("Ballad", "Ballad 2"); three is a rehearsal room.
 */
export function repeatedStems(titles: string[], threshold = 3): Set<string> {
  const counts = new Map<string, number>()
  for (const title of titles) {
    const stem = stemOf(title)
    if (!stem) continue
    counts.set(stem, (counts.get(stem) ?? 0) + 1)
  }
  const repeated = new Set<string>()
  for (const [stem, n] of counts) if (n >= threshold) repeated.add(stem)
  return repeated
}

/**
 * looksUnnamed, widened by what the rest of the library says. Falls back to
 * the per-title rules when no stem set is available.
 */
export function looksUnnamedInLibrary(title: string, repeated?: Set<string>): boolean {
  if (looksUnnamed(title)) return true
  return repeated ? repeated.has(stemOf(title)) : false
}
