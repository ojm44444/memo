/**
 * Absurd two-word names for untitled memos.
 *
 * Not a gimmick: three songwriters in the research independently gave each
 * other this exact advice. The fullest version was that "waltz in D 6/8 no. 6"
 * means nothing to you a year later, while an absurd two-word name is
 * instantly recognisable to you AND to your band.
 *
 * It also solves the real problem with asking someone to name a file at import
 * time, which is that you are demanding typing at the precise moment nobody
 * wants to type. A suggestion you can accept with one tap is a different ask
 * from a blank field.
 *
 * No model and no network: two word lists and a seeded pick. Seeded from the
 * song id so the same card always suggests the same name and it never changes
 * under the person looking at it.
 *
 * Word rules: concrete noun plus unrelated concrete noun, never crude, and
 * never anything that reads as a real song title. If it sounds like it could
 * be on a record, it fails the job, because the whole point is that it is
 * memorable BECAUSE it is wrong.
 */
const FIRST = [
  'Unicorn', 'Velvet', 'Tractor', 'Lobster', 'Midnight', 'Plastic', 'Copper',
  'Rubber', 'Thunder', 'Biscuit', 'Marble', 'Neon', 'Wobbly', 'Concrete',
  'Silver', 'Feral', 'Damp', 'Electric', 'Tiny', 'Enormous', 'Haunted',
  'Polite', 'Wonky', 'Glass', 'Iron', 'Suspicious', 'Cardboard', 'Golden',
  'Frozen', 'Reluctant', 'Municipal', 'Wet',
]

const SECOND = [
  'Pants', 'Sandwich', 'Lighthouse', 'Escalator', 'Pigeon', 'Cathedral',
  'Trombone', 'Hamster', 'Motorway', 'Wardrobe', 'Kettle', 'Postcode',
  'Badger', 'Tunnel', 'Ferry', 'Bicycle', 'Chimney', 'Doorbell', 'Anchor',
  'Umbrella', 'Piano', 'Toaster', 'Church', 'Balloon', 'Hedge', 'Lantern',
  'Staircase', 'Windmill', 'Envelope', 'Harbour', 'Greenhouse', 'Radiator',
]

/** Deterministic 32-bit hash, so a given id always yields the same name. */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function absurdNameFor(seed: string): string {
  const h = hash(seed)
  const first = FIRST[h % FIRST.length]
  const second = SECOND[Math.floor(h / FIRST.length) % SECOND.length]
  return `${first} ${second}`
}

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
 * Strip a trailing counter: "The Good Rehearsal Rooms 14" -> "The Good
 * Rehearsal Rooms". Used to spot iOS location auto-names in bulk.
 */
function stemOf(title: string): string {
  return title.trim().replace(/\s+\d+$/, '').trim().toLowerCase()
}

/**
 * iOS names a voice memo after where you were standing, then appends a
 * counter: "The Good Rehearsal Rooms 2" through "14", "9 Wheelwrights Way 6",
 * "Maple Leaf Business Park 18". Owen's real library is mostly these.
 *
 * No regex can tell "Five Bells Inn" from a title someone chose, because in
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
