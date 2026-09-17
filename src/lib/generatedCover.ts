/**
 * The generated record cover, shared by the on-screen art (RecordArt) and a
 * real image of it (renderGeneratedCover), so a share link shows exactly the
 * cover the playlist has in the app (17 Sept, Owen: the link offered a
 * different cover from the one that already existed).
 */

export function hashSeed(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

/* Every generated cover is different, all in the brand's sea-to-mint family,
   but far enough apart to tell playlists apart at a glance. Given a `variant`
   (a playlist's place in the grid) neighbours never match. */
export const COVER_PALETTES: [string, string, string][] = [
  ['#1f5f6b', '#51a0a9', '#bbe6b8'], // sea
  ['#0e2a3a', '#2f6f9e', '#8ed2b2'], // night
  ['#3f8f73', '#8fcf9a', '#e3f2b8'], // lime
  ['#0d1f27', '#1f5f6b', '#66baaf'], // deep
  ['#24507a', '#4f9bb8', '#bfe6dc'], // ocean
  ['#274b3a', '#5c9a73', '#c9e8b8'], // moss
  ['#1d3b4f', '#6a8fa8', '#d6e9df'], // dusk
  ['#2f7f8a', '#8ed2b2', '#f1f7da'], // glass
]

export function coverAngle(h: number) {
  return 110 + (h % 140)
}

export function coverBars(h: number) {
  return [0.5, 0.78, 0.62, 0.95].map((b, i) => Math.max(0.45, b - ((h >> (i * 4)) & 15) / 90))
}

/** A 1200px JPEG of the generated cover, drawn the way the CSS draws it. */
export async function renderGeneratedCover(seed: string, variant?: number): Promise<File> {
  const size = 1200
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the cover')

  const h = hashSeed(seed)
  const [a, b, c] = COVER_PALETTES[Math.abs(variant ?? h) % COVER_PALETTES.length]
  const rad = (coverAngle(h) * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const half = (size * (Math.abs(Math.sin(rad)) + Math.abs(Math.cos(rad)))) / 2
  const cx = size / 2
  const g = ctx.createLinearGradient(cx - dx * half, cx - dy * half, cx + dx * half, cx + dy * half)
  g.addColorStop(0, a)
  g.addColorStop(0.45, b)
  g.addColorStop(1, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // The low-left shade (CSS: radial-gradient 130% 100% at 15% 115%).
  ctx.save()
  ctx.translate(size * 0.15, size * 1.15)
  ctx.scale(1.3, 1)
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.62)
  shade.addColorStop(0, 'rgba(8, 20, 26, 0.6)')
  shade.addColorStop(1, 'rgba(8, 20, 26, 0)')
  ctx.fillStyle = shade
  ctx.fillRect(-size, -size * 2, size * 3, size * 3)
  ctx.restore()

  // Bars: 66% wide, 17% from the left and bottom, 40% tall, gaps 10%.
  const boxW = size * 0.66
  const boxH = size * 0.4
  const left = size * 0.17
  const bottom = size * 0.83
  const gap = boxW * 0.1
  const barW = (boxW - gap * 3) / 4
  ctx.fillStyle = 'rgba(244, 249, 246, 0.94)'
  coverBars(h).forEach((height, i) => {
    const bh = boxH * height
    const x = left + i * (barW + gap)
    const y = bottom - bh
    ctx.beginPath()
    ctx.roundRect(x, y, barW, bh, barW / 2)
    ctx.fill()
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Could not draw the cover')
  return new File([blob], 'cover.jpg', { type: 'image/jpeg' })
}
