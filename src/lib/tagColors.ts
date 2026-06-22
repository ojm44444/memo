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

// Each preset gets a fixed gradient; custom tags get one derived from their name
const GRADIENTS = [
  'linear-gradient(135deg,#f97316,#ef4444)',   // Riff — orange-red
  'linear-gradient(135deg,#ec4899,#a855f7)',   // Vocal idea — pink-purple
  'linear-gradient(135deg,#3b82f6,#06b6d4)',   // Chorus — blue-cyan
  'linear-gradient(135deg,#10b981,#3b82f6)',   // Verse — green-blue
  'linear-gradient(135deg,#f59e0b,#f97316)',   // Bridge — amber-orange
  'linear-gradient(135deg,#8b5cf6,#6366f1)',   // Instrumental — purple-indigo
  'linear-gradient(135deg,#06b6d4,#6dffb8)',   // Inspiration — cyan-mint
  'linear-gradient(135deg,#22c55e,#10b981)',   // Full idea — green-emerald
  'linear-gradient(135deg,#eab308,#84cc16)',   // Lyrics drafted — amber-lime
  'linear-gradient(135deg,#6dffb8,#3b82f6)',   // Lyrics finished — mint-blue
  // extras for custom tags
  'linear-gradient(135deg,#f43f5e,#f97316)',
  'linear-gradient(135deg,#a855f7,#ec4899)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#84cc16,#06b6d4)',
  'linear-gradient(135deg,#fb923c,#eab308)',
]

function hashStr(s: string): number {
  let h = 0
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function getTagGradient(tag: string): string {
  const idx = PRESET_TAGS.findIndex((p) => p.toLowerCase() === tag.toLowerCase())
  if (idx >= 0) return GRADIENTS[idx]
  return GRADIENTS[PRESET_TAGS.length + (hashStr(tag) % (GRADIENTS.length - PRESET_TAGS.length))]
}
