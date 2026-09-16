import { useCallback, useEffect, useRef, useState } from 'react'
import { getFilesFromDataTransferAsync, getFilesFromDataTransferSync, isFileDragEvent } from '@/lib/extract-audio-files'
import { addListenFiles, unpackAudio } from '@/lib/listenImport'
import { PlusIcon } from '@/components/ui/Icons'

/** Drop or pick audio into Listen. The work is in lib/listenImport. */
export function MixImport({
  variant = 'button',
  projectId = null,
  acceptDrops = true,
}: {
  variant?: 'button' | 'empty' | 'circle'
  /** Only one importer on screen should catch drops, or files land twice. */
  acceptDrops?: boolean
  /** The Listen project this was opened in. Everything added lands in it. */
  projectId?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  const add = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const { audio } = await unpackAudio(incoming)
        if (!audio.length) {
          setError('No audio in that. Use WAV, AIFF, FLAC, MP3 or M4A.')
          return
        }
        const count = await addListenFiles(audio, projectId)
        setNotice(`${count} added. Uploading now.`)
      } catch {
        setError('Could not add that. If it is a zip, try unzipping it first.')
      } finally {
        setBusy(false)
      }
    },
    [projectId],
  )

  // Drop anywhere on Listen. Capture phase, so the file never reaches the
  // browser (which would open it and leave the app).
  useEffect(() => {
    if (!acceptDrops) return
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
        void add(sync)
        return
      }
      void getFilesFromDataTransferAsync(dt).then((files) => add(files.length ? files : sync))
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
  }, [add, acceptDrops])

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.aif,.aiff,.flac,.zip,application/zip"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void add(files)
        }}
      />
      {variant === 'empty' ? (
        <button type="button" className="mix-drop-zone" onClick={() => inputRef.current?.click()}>
          <span className="mix-drop-title">{busy ? 'Adding…' : 'Drop audio files here'}</span>
          <span className="mix-drop-sub">WAVs, a folder, or a zip. Or click to choose.</span>
        </button>
      ) : variant === 'circle' ? (
        <button
          type="button"
          className="rec-circle"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Add audio"
          title="Add audio"
        >
          <PlusIcon size={20} />
        </button>
      ) : (
        <button type="button" className="mix-upload-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : '+ Add audio'}
        </button>
      )}

      {(notice || error) && (
        <p className={`${error ? 'mix-upload-error' : 'mix-import-notice'}${variant === 'circle' ? ' is-toast' : ''}`}>
          {error ?? notice}
        </p>
      )}

      {dragging && (
        <div className="mix-drop-overlay" aria-hidden>
          <div className="mix-drop-overlay-card">
            <span className="mix-drop-title">Drop to add</span>
            <span className="mix-drop-sub">Each file becomes a track.</span>
          </div>
        </div>
      )}
    </>
  )
}
