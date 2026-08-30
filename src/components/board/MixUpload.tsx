import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addAudioVersionToSong, setAudioVersionKind } from '@/db/repositories/audioRepo'
import { createSong, getAllSongs, getColumns } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { AUDIO_MIME_ALLOWLIST } from '@/lib/constants'
import { INBOX_SLUG } from '@/types/column'

/**
 * Putting a mix into the Listen room.
 *
 * Until now audio could only enter through the Songwriting board or the song
 * drawer's "+ Add clip", which meant a mix coming back from an engineer had to
 * be imported as a rough take and then reclassified. That is the wrong shape:
 * a mix does not arrive as an idea you had, it arrives finished.
 *
 * So this drops a file straight onto a stack. Two decisions only, both
 * defaulted: which song it belongs to (guessed from the filename) and whether
 * it is a mix or the master. Anything more is a form, and nobody fills in a
 * form to listen to something.
 */

/** "Kettle Song v3 FINAL mix.wav" -> "kettle song v3 final mix" */
function normalise(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/\b(final|master|mastered|mix|mixed|v\d+|ver\d+|take\d+|wav|mp3)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Does the filename look like it already names a song on the board? */
function guessSongId(fileName: string, songs: { id: string; title: string }[]) {
  const target = normalise(fileName)
  if (!target) return null
  let best: { id: string; score: number } | null = null
  for (const song of songs) {
    const title = normalise(song.title)
    if (!title) continue
    // Containment either way: "kettle song v3 mix.wav" matches "the kettle
    // song", and "kettle.wav" matches it too.
    const hit = target.includes(title) || title.includes(target)
    if (!hit) continue
    const score = Math.min(target.length, title.length)
    if (!best || score > best.score) best = { id: song.id, score }
  }
  return best?.id ?? null
}

interface PendingFile {
  file: File
  songId: string | null
  kind: 'mix' | 'master'
}

export function MixUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const songs = useLiveQuery(() => getAllSongs(), [])
  const [pending, setPending] = useState<PendingFile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const songOptions = (songs ?? [])
    .filter((s) => !s.deletedAt)
    .map((s) => ({ id: s.id, title: s.title }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const stage = (files: FileList | null) => {
    if (!files?.length) return
    const audio = Array.from(files).filter(
      (f) => f.type.startsWith('audio/') || AUDIO_MIME_ALLOWLIST.includes(f.type),
    )
    if (!audio.length) {
      setError('None of those were audio files.')
      return
    }
    setError(null)
    setPending(
      audio.map((file) => ({
        file,
        songId: guessSongId(file.name, songOptions),
        // A file with "master" in the name is telling you what it is.
        kind: /\bmaster(ed)?\b/i.test(file.name) ? 'master' : 'mix',
      })),
    )
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      for (const item of pending) {
        let songId = item.songId
        if (!songId) {
          // No song to attach to, so the mix brings one with it. It lands in
          // the rightmost column rather than Inbox: a mix is not a raw idea,
          // and dropping it in Inbox would make the songwriting board lie.
          // Columns are user-defined, so there is no 'demos' slug to rely on;
          // furthest right is the closest thing to "most finished".
          const columns = await getColumns()
          const target = columns.length
            ? columns[columns.length - 1].slug
            : INBOX_SLUG
          const created = await createSong({
            title: item.file.name.replace(/\.[^.]+$/, ''),
            columnSlug: target,
          })
          songId = created.id
        }
        const version = await addAudioVersionToSong(songId, item.file)
        await setAudioVersionKind(version.id, item.kind)
      }
      scheduleFlush()
      setPending([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mix-upload">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          stage(e.target.files)
          e.target.value = ''
        }}
      />

      {pending.length === 0 ? (
        <button
          type="button"
          className="mix-upload-btn"
          onClick={() => inputRef.current?.click()}
        >
          + Add a mix
        </button>
      ) : (
        <div className="mix-upload-panel">
          <p className="mix-upload-title">
            {pending.length === 1 ? 'One file' : `${pending.length} files`}. Which song?
          </p>

          <ul className="mix-upload-list">
            {pending.map((item, i) => (
              <li key={item.file.name + i} className="mix-upload-row">
                <span className="mix-upload-name" title={item.file.name}>
                  {item.file.name}
                </span>

                <select
                  className="mix-upload-select"
                  value={item.songId ?? ''}
                  aria-label={`Song for ${item.file.name}`}
                  onChange={(e) =>
                    setPending((prev) =>
                      prev.map((p, j) =>
                        j === i ? { ...p, songId: e.target.value || null } : p,
                      ),
                    )
                  }
                >
                  <option value="">New song from this file</option>
                  {songOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>

                <div className="mix-upload-kind" role="group" aria-label="Mix or master">
                  {(['mix', 'master'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`mix-upload-kind-btn${item.kind === k ? ' is-on' : ''}`}
                      aria-pressed={item.kind === k}
                      onClick={() =>
                        setPending((prev) =>
                          prev.map((p, j) => (j === i ? { ...p, kind: k } : p)),
                        )
                      }
                    >
                      {k === 'mix' ? 'Mix' : 'Master'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          {error && <p className="mix-upload-error">{error}</p>}

          <div className="mix-upload-actions">
            <button
              type="button"
              className="mix-upload-save"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Adding…' : 'Add to the stack'}
            </button>
            <button
              type="button"
              className="mix-upload-cancel"
              onClick={() => {
                setPending([])
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pending.length === 0 && error && <p className="mix-upload-error">{error}</p>}
    </div>
  )
}
