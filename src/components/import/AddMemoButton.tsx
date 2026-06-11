import { useRef } from 'react'
import { useAudioImport } from '@/hooks/useAudioImport'

export function AddMemoButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { importing, importFiles } = useAudioImport('inbox')

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.aac,.caf"
        multiple
        className="hidden"
        disabled={importing}
        onChange={(e) => {
          const list = e.target.files
          if (!list?.length || importing) return
          void importFiles(list).finally(() => {
            window.setTimeout(() => {
              if (inputRef.current) inputRef.current.value = ''
            }, 0)
          })
        }}
      />
      <button
        type="button"
        className="board-add-card w-full"
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        {importing ? 'Importing…' : '+ Import audio'}
      </button>
    </>
  )
}
