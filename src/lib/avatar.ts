import { supabase } from '@/lib/supabase/client'

/**
 * Who left this note, as a face rather than a word.
 *
 * A comment thread between bandmates needs to be scannable by person, and a
 * lowercase email prefix ("owen", "dev") is the weakest possible way to do
 * that. Google already hands us a picture when someone signs in with it, so
 * the default costs nothing; anyone else gets initials on a colour derived
 * from their name, which is stable and never collides with the accent.
 *
 * Deliberately NOT stored on the comment row. Adding an avatar column to a
 * synced table means a migration, and an avatar that is copied onto every
 * comment goes stale the moment someone changes their picture. The URL is
 * looked up from the person's identity instead.
 */

/** One or two letters, from a name or an email prefix. */
export function initialsFor(label: string): string {
  const clean = label.trim()
  if (!clean) return '?'
  const words = clean.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/**
 * A stable hue per person. Kept off the accent's own hue so a face never
 * competes with the one thing on screen that is allowed to be loud.
 */
export function avatarHue(label: string): number {
  let h = 0
  for (const c of label) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  // 200-320: blues through violets. The board's accent lives at 78-206, so
  // this range stays clear of the stage ramp as well.
  return 200 + (Math.abs(h) % 120)
}

/**
 * The signed-in person's picture: whatever they uploaded, else whatever their
 * identity provider gave us (Google sets avatar_url), else null for initials.
 */
export async function getMyAvatarUrl(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  const meta = data.user?.user_metadata as Record<string, unknown> | undefined
  if (!meta) return null
  const custom = meta.custom_avatar_url
  if (typeof custom === 'string' && custom) return custom
  const provider = meta.avatar_url ?? meta.picture
  return typeof provider === 'string' && provider ? provider : null
}

/**
 * Store a picture the person chose themselves.
 *
 * Downscaled to 128px and kept as a data URL on the auth user's metadata
 * rather than in a storage bucket. A bucket would be the right home for a
 * large file, but a 128px avatar is a few kilobytes and this way there is no
 * bucket to provision, no policy to get wrong, and nothing to clean up when
 * someone deletes their account.
 */
export async function setMyAvatar(file: File): Promise<string> {
  if (!supabase) throw new Error('Sign in required')
  const dataUrl = await downscaleToDataUrl(file, 128)
  const { error } = await supabase.auth.updateUser({
    data: { custom_avatar_url: dataUrl },
  })
  if (error) throw error
  return dataUrl
}

export async function clearMyAvatar(): Promise<void> {
  if (!supabase) throw new Error('Sign in required')
  const { error } = await supabase.auth.updateUser({
    data: { custom_avatar_url: null },
  })
  if (error) throw error
}

/** Square-crop from the centre, downscale, and encode as a small JPEG. */
async function downscaleToDataUrl(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  // Auth metadata is not a file store. Refuse rather than silently failing a
  // request later with an opaque error.
  if (dataUrl.length > 200_000) {
    throw new Error('That image is too large. Try a smaller one.')
  }
  return dataUrl
}
