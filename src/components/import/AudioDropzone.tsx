import { useCallback, useState } from 'react'
import { importAudioFiles } from '@/db/repositories/audioRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { AUDIO_MIME_ALLOWLIST } from '@/lib/constants'
import type { ColumnSlug } from '@/types/column'
import { cn } from '@/lib/cn'

interface AudioDropzoneProps {
  columnSlug?: ColumnSlug
  className?: string
}

export function AudioDropzone({ columnSlug = 'inbox', className }: AudioDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const AUDIO_EXTENSIONS = /\.(mp3|m4a|wav|aac|ogg|opus|flac|aiff|aif|webm|mp4|caf)$/i

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const audioFiles = Array.from(files).filter(
        (f) =>
          f.type.startsWith('audio/') ||
          AUDIO_MIME_ALLOWLIST.includes(f.type) ||
          AUDIO_EXTENSIONS.test(f.name),
      )
      if (audioFiles.length === 0) {
        setError('No audio files recognised. Try mp3, m4a, wav.')
        return
      }

      setError(null)
      setImporting(true)
      try {
        await importAudioFiles(audioFiles, columnSlug)
        scheduleFlush()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed')
      } finally {
        setImporting(false)
      }
    },
    [columnSlug],
  )

  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-white/10 p-4 text-center transition-colors',
        dragging && 'border-audio-mint/40 bg-audio-mint/5',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        id="audio-import"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <label htmlFor="audio-import" className="cursor-pointer font-mono text-[0.65rem] text-muted">
        {importing ? 'Importing…' : '+ Drop audio files or tap to import'}
      </label>
      {error && (
        <p className="mt-1 font-mono text-[0.6rem] text-red-400">{error}</p>
      )}
    </div>
  )
}
