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
