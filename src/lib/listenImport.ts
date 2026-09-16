import { addAudioVersionToSong, setAudioVersionKind } from '@/db/repositories/audioRepo'
import { createSong } from '@/db/repositories/boardRepo'
import { moveSongsToListenProject } from '@/db/repositories/listenProjectRepo'
import { flush, scheduleFlush } from '@/sync/syncEngine'
import { extractAudioFiles } from '@/lib/extract-audio-files'
import { LISTEN_SLUG } from '@/types/column'

/**
 * Getting files into Listen, the way Samply does it: drop, and they are there.
 * Each file becomes a track; tracks become versions of one song by joining
 * them. Listen tracks live under LISTEN_SLUG, which the board never shows.
 */

const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip']
const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|mp3|m4a|mp4|aac|ogg|opus|caf|webm|amr)$/i

function isZip(file: File) {
  return ZIP_TYPES.includes(file.type) || /\.zip$/i.test(file.name)
}

function tidyLabel(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function unpackAudio(files: File[]): Promise<{ audio: File[]; skipped: number }> {
  const out: File[] = []
  let skipped = 0
  for (const file of files) {
    if (!isZip(file)) {
      out.push(file)
      continue
    }
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || entry.name.includes('__MACOSX') || entry.name.split('/').pop()?.startsWith('.')) continue
      const base = entry.name.split('/').pop() ?? entry.name
      if (!AUDIO_EXT.test(base)) {
        skipped++
        continue
      }
      const blob = await entry.async('blob')
      out.push(new File([blob], base, { type: guessType(base) }))
    }
  }
  const audio = extractAudioFiles(out)
  return { audio, skipped: skipped + (out.length - audio.length) }
}

function guessType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'wav':
    case 'wave':
      return 'audio/wav'
    case 'aif':
    case 'aiff':
      return 'audio/aiff'
    case 'mp3':
      return 'audio/mpeg'
    case 'flac':
      return 'audio/flac'
    case 'ogg':
      return 'audio/ogg'
    default:
      return 'audio/mp4'
  }
}


/** Each file becomes its own track, in the project if there is one. */
export async function addListenFiles(files: File[], projectId: string | null) {
  const ids: string[] = []
  for (const file of files) {
    const title = tidyLabel(file.name) || 'Untitled'
    const song = await createSong({ title, columnSlug: LISTEN_SLUG })
    const version = await addAudioVersionToSong(song.id, file, title)
    await setAudioVersionKind(version.id, 'mix')
    ids.push(song.id)
  }
  if (projectId) await moveSongsToListenProject(ids, projectId)
  scheduleFlush()
  void flush()
  return ids.length
}

/** New versions on an existing track; the newest goes on top. */
export async function addVersionFiles(songId: string, files: File[]) {
  const { audio } = await unpackAudio(files)
  for (const file of audio) {
    const version = await addAudioVersionToSong(songId, file, tidyLabel(file.name) || 'Untitled')
    await setAudioVersionKind(version.id, 'mix')
  }
  scheduleFlush()
  void flush()
  return audio.length
}


