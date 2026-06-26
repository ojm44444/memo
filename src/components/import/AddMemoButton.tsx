import { useRef } from 'react'
import { useAudioImport } from '@/hooks/useAudioImport'
import type { ColumnSlug } from '@/types/column'

interface AddMemoButtonProps {
  columnSlug?: ColumnSlug
  /** Renders as a small icon button for column headers */
  compact?: boolean
}

export function AddMemoButton({ columnSlug = 'inbox', compact = false }: AddMemoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { importing, importFiles } = useAudioImport(columnSlug)

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
      {compact ? (
        <button
          type="button"
          className="column-header-import-btn"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          title={importing ? 'Importing…' : 'Import audio into this column'}
          aria-label="Import audio"
        >
          {importing ? '…' : '+'}
        </button>
      ) : (
        <button
          type="button"
          className="board-add-card w-full"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? 'Importing…' : '+ Import audio'}
        </button>
      )}
    </>
  )
}
