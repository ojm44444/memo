import { useRef, useState } from 'react'
import { addAudioVersionToSong } from '@/db/repositories/audioRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { AUDIO_MIME_ALLOWLIST } from '@/lib/constants'

interface AddVersionButtonProps {
  songId: string
  /** "round": the panel's + button beside Play. Default: a text link. */
  variant?: 'link' | 'round'
}

export function AddVersionButton({ songId, variant = 'link' }: AddVersionButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const audioFiles = Array.from(files).filter(
      (f) => f.type.startsWith('audio/') || AUDIO_MIME_ALLOWLIST.includes(f.type),
    )
    if (!audioFiles.length) return

    setAdding(true)
    try {
      for (const file of audioFiles) {
        await addAudioVersionToSong(songId, file)
      }
      scheduleFlush()
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {variant === 'round' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="sp-round"
          aria-label="Add a take"
          title="Add a take"
          disabled={adding}
        >
          {adding ? <span className="player-bar-spinner" /> : '+'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="song-detail-link"
        >
          {adding ? 'Adding…' : '+ Add take'}
        </button>
      )}
    </>
  )
}
