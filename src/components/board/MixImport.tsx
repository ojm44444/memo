import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addAudioVersionToSong, getSongsWithMixes, setAudioVersionKind } from '@/db/repositories/audioRepo'
import { createSong, getAllSongs, getColumns } from '@/db/repositories/boardRepo'
import { moveSongsToListenProject } from '@/db/repositories/listenProjectRepo'
import { flush, scheduleFlush } from '@/sync/syncEngine'
import {
  extractAudioFiles,
  getFilesFromDataTransferAsync,
  getFilesFromDataTransferSync,
  isFileDragEvent,
} from '@/lib/extract-audio-files'
import { INBOX_SLUG } from '@/types/column'
import { PlusIcon } from '@/components/ui/Icons'

/**
 * Getting mixes into Listen.
 *
 * Mixes arrive the way they always do: a WeTransfer zip, a Dropbox folder, a
 * handful of WAVs on an email. So this takes all of those, dropped anywhere on
 * the Listen room or picked from a button, zips unpacked in the browser.
 *
 * Every file then gets one row with the three answers already filled in:
 * which stack it belongs on (matched by name, Listen stacks first), whether it
 * is a mix or the master, and what to call this version. Files that match
 * nothing and share a name ("Kettle v1", "Kettle v2") become ONE new stack,
 * oldest version at the bottom, because that is what they are.
 *
 * Nothing about this runs through the Songwriting board's Inbox import:
 * a mix is not a raw idea.
 */

type Target = { type: 'song'; songId: string } | { type: 'new'; key: string }

interface Row {
  id: string
  file: File
  target: Target
  newTitle: string
  kind: 'demo' | 'mix' | 'master'
  label: string
  version: number | null
}

const ZIP_TYPES = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip']
const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|mp3|m4a|mp4|aac|ogg|opus|caf|webm|amr)$/i

function isZip(file: File) {
  return ZIP_TYPES.includes(file.type) || /\.zip$/i.test(file.name)
}

/** "Kettle_Song v3 FINAL mix.wav" -> "kettle song" */
function normalise(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b(final|master|mastered|mixed|mix|mixdown|bounce|ref|v\d+|ver\s?\d+|version\s?\d+|take\s?\d+|wav|mp3|\d{2,3}k|24bit|16bit)\b/g, ' ')
    .replace(/\(\s*\d*\s*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function versionNumber(name: string) {
  const m = name.match(/\b(?:v|ver|version|mix)\s?(\d{1,2})\b/i)
  return m ? Number(m[1]) : null
}

function tidyLabel(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function titleFrom(name: string) {
  const base = normalise(name)
  if (!base) return tidyLabel(name)
  return base.replace(/\b\w/g, (c) => c.toUpperCase())
}

function match(fileName: string, songs: { id: string; title: string }[]) {
  const target = normalise(fileName)
  if (!target) return null
  let best: { id: string; score: number } | null = null
  for (const song of songs) {
    const title = normalise(song.title)
    if (!title) continue
    const hit = target === title ? 1000 : target.includes(title) || title.includes(target) ? Math.min(target.length, title.length) : 0
    if (hit && (!best || hit > best.score)) best = { id: song.id, score: hit }
  }
  return best?.id ?? null
}

async function unpack(files: File[]): Promise<{ audio: File[]; skipped: number }> {
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

function sizeLabel(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

export function MixImport({
  variant = 'button',
  projectId = null,
}: {
  variant?: 'button' | 'empty' | 'circle'
  /** The Listen project this was opened in. Everything saved lands in it. */
  projectId?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const songs = useLiveQuery(() => getAllSongs(), [])
  const stacks = useLiveQuery(() => getSongsWithMixes(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const listenSongs = useMemo(
    () => (stacks ?? []).map((s) => ({ id: s.song.id, title: s.song.title })),
    [stacks],
  )
  const boardSongs = useMemo(() => {
    const inListen = new Set(listenSongs.map((s) => s.id))
    return (songs ?? [])
      .filter((s) => !s.deletedAt && !inListen.has(s.id))
      .map((s) => ({ id: s.id, title: s.title }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [songs, listenSongs])

  const stage = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length) return
      setReading(true)
      setError(null)
      setNotice(null)
      try {
        const { audio, skipped } = await unpack(incoming)
        if (!audio.length) {
          setError('No audio in that. Mixes need to be WAV, AIFF, FLAC, MP3 or M4A.')
          return
        }
        const staged: Row[] = audio.map((file, i) => {
          const songId = match(file.name, listenSongs) ?? match(file.name, boardSongs)
          return {
            id: `${Date.now()}-${i}`,
            file,
            target: songId ? { type: 'song', songId } : { type: 'new', key: normalise(file.name) || file.name },
            newTitle: titleFrom(file.name),
            kind: /\bmaster(ed)?\b/i.test(file.name) ? 'master' : /\bdemo\b/i.test(file.name) ? 'demo' : 'mix',
            label: tidyLabel(file.name),
            version: versionNumber(file.name),
          }
        })
        setRows((prev) => [...prev, ...staged])
        if (skipped > 0) setNotice(`${skipped} ${skipped === 1 ? 'file was' : 'files were'} not audio and left out.`)
      } catch {
        setError('Could not read that. If it is a zip, try unzipping it first.')
      } finally {
        setReading(false)
      }
    },
    [listenSongs, boardSongs],
  )

  // Drop anywhere on Listen. Capture phase, so the file never reaches the
  // browser (which would open it and leave the app).
  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
      if (!isFileDragEvent(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!isFileDragEvent(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent) => {
      if (!isFileDragEvent(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      setDragging(false)
      const dt = e.dataTransfer
      const sync = getFilesFromDataTransferSync(dt)
      if (sync.length && sync.every((f) => f.size > 0)) {
        void stage(sync)
        return
      }
      void getFilesFromDataTransferAsync(dt).then((files) => stage(files.length ? files : sync))
    }
    window.addEventListener('dragenter', onEnter, true)
    window.addEventListener('dragover', onOver, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragenter', onEnter, true)
      window.removeEventListener('dragover', onOver, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [stage])

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const newStackCount = new Set(rows.filter((r) => r.target.type === 'new').map((r) => (r.target as { key: string }).key)).size

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const columns = await getColumns()
      const column = columns.length ? columns[columns.length - 1].slug : INBOX_SLUG
      const created = new Map<string, string>()
      const touched: string[] = []

      // Oldest version first, so the newest lands on top of each stack.
      const ordered = [...rows].sort((a, b) => (a.version ?? 0) - (b.version ?? 0))
      for (const row of ordered) {
        let songId: string
        if (row.target.type === 'song') {
          songId = row.target.songId
        } else {
          const existing = created.get(row.target.key)
          if (existing) songId = existing
          else {
            const song = await createSong({ title: row.newTitle.trim() || tidyLabel(row.file.name), columnSlug: column })
            created.set(row.target.key, song.id)
            songId = song.id
          }
        }
        const version = await addAudioVersionToSong(songId, row.file, row.label.trim() || tidyLabel(row.file.name))
        await setAudioVersionKind(version.id, row.kind)
        if (!touched.includes(songId)) touched.push(songId)
      }
      if (projectId) await moveSongsToListenProject(touched, projectId)
      const count = rows.length
      setRows([])
      setNotice(`${count} added. Uploading now, keep songdrafts open.`)
      scheduleFlush()
      void flush()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Nothing was lost; try again.')
    } finally {
      setSaving(false)
    }
  }

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept="audio/*,.wav,.aif,.aiff,.flac,.zip,application/zip"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        void stage(files)
      }}
    />
  )

  return (
    <>
      {picker}
      {variant === 'empty' ? (
        <button type="button" className="mix-drop-zone" onClick={() => inputRef.current?.click()}>
          <span className="mix-drop-title">{reading ? 'Reading…' : 'Drop demos, mixes or masters here'}</span>
          <span className="mix-drop-sub">WAVs, a folder, or the WeTransfer zip as it came. Or click to choose.</span>
        </button>
      ) : variant === 'circle' ? (
        <button
          type="button"
          className="rec-circle"
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          aria-label="Add demos, mixes or masters"
          title="Add demos, mixes or masters"
        >
          <PlusIcon size={20} />
        </button>
      ) : (
        <button type="button" className="mix-upload-btn" onClick={() => inputRef.current?.click()} disabled={reading}>
          {reading ? 'Reading…' : '+ Add mixes'}
        </button>
      )}

      {(notice || (error && rows.length === 0)) && (
        <p className={`${error ? 'mix-upload-error' : 'mix-import-notice'}${variant === 'circle' ? ' is-toast' : ''}`}>
          {error ?? notice}
        </p>
      )}

      {dragging && (
        <div className="mix-drop-overlay" aria-hidden>
          <div className="mix-drop-overlay-card">
            <span className="mix-drop-title">Drop to add to Listen</span>
            <span className="mix-drop-sub">Files, folders and zips. Not the Songwriting board.</span>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="send-sheet-backdrop" onClick={() => !saving && setRows([])}>
          <div className="send-sheet" role="dialog" aria-modal="true" aria-label="Add mixes" onClick={(e) => e.stopPropagation()}>
            <div className="send-sheet-head">
              <h2 className="send-sheet-title">
                {rows.length === 1 ? 'One file' : `${rows.length} files`}
              </h2>
              <button type="button" className="send-sheet-close" onClick={() => setRows([])} aria-label="Close">
                ✕
              </button>
            </div>
            <p className="send-sheet-note">
              Matched by name. Check where each one goes, then add them.
              {newStackCount > 0 ? ` ${newStackCount} new ${newStackCount === 1 ? 'stack' : 'stacks'}.` : ''}
            </p>

            <ul className="import-rows">
              {rows.map((row) => {
                const value = row.target.type === 'song' ? row.target.songId : `new:${row.target.key}`
                return (
                  <li key={row.id} className="import-row">
                    <div className="import-file">
                      <span className="import-file-name" title={row.file.name}>
                        {row.file.name}
                      </span>
                      <span className="import-file-size">{sizeLabel(row.file.size)}</span>
                      <button
                        type="button"
                        className="import-remove"
                        aria-label={`Leave out ${row.file.name}`}
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="import-fields">
                      <label className="send-field">
                        <span>Goes on</span>
                        <select
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value
                            update(row.id, {
                              target: v.startsWith('new:') ? { type: 'new', key: v.slice(4) } : { type: 'song', songId: v },
                            })
                          }}
                        >
                          <option value={`new:${normalise(row.file.name) || row.file.name}`}>New stack</option>
                          {listenSongs.length > 0 && (
                            <optgroup label="Stacks in Listen">
                              {listenSongs.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {boardSongs.length > 0 && (
                            <optgroup label="Songs on your board">
                              {boardSongs.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.title}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </label>
                      {row.target.type === 'new' && (
                        <label className="send-field">
                          <span>Song name</span>
                          <input value={row.newTitle} onChange={(e) => update(row.id, { newTitle: e.target.value })} />
                        </label>
                      )}
                      <label className="send-field">
                        <span>This version</span>
                        <input value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} />
                      </label>
                      <div className="send-field">
                        <span>Is it</span>
                        <div className="mix-upload-kind" role="group" aria-label="Demo, mix or master">
                          {(['demo', 'mix', 'master'] as const).map((k) => (
                            <button
                              key={k}
                              type="button"
                              className={`mix-upload-kind-btn${row.kind === k ? ' is-on' : ''}`}
                              aria-pressed={row.kind === k}
                              onClick={() => update(row.id, { kind: k })}
                            >
                              {k === 'demo' ? 'Demo' : k === 'mix' ? 'Mix' : 'Master'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <button type="button" className="import-more" onClick={() => inputRef.current?.click()}>
              + Add more files
            </button>

            {error && <p className="send-sheet-error">{error}</p>}

            <div className="send-sheet-actions">
              <button type="button" className="send-sheet-secondary" onClick={() => setRows([])} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="send-sheet-primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Adding…' : rows.length === 1 ? 'Add to Listen' : `Add ${rows.length} to Listen`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
