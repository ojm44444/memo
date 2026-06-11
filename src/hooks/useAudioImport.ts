import { useCallback, useRef, useState } from 'react'
import { importAudioFiles } from '@/db/repositories/audioRepo'
import { flush } from '@/sync/syncEngine'
import { extractAudioFiles } from '@/lib/extract-audio-files'
import type { ColumnSlug } from '@/types/column'

export type ImportFilesResult = {
  imported: number
  duplicates: string[]
}

export function useAudioImport(defaultColumn: ColumnSlug = 'inbox') {
  const [importing, setImporting] = useState(false)
  const [lastCount, setLastCount] = useState(0)
  const inFlightRef = useRef(false)

  const importFiles = useCallback(
    async (
      files: FileList | File[],
      columnSlug: ColumnSlug = defaultColumn,
    ): Promise<ImportFilesResult> => {
      if (inFlightRef.current) return { imported: 0, duplicates: [] }

      const audioFiles = extractAudioFiles(files)
      if (audioFiles.length === 0) return { imported: 0, duplicates: [] }

      inFlightRef.current = true
      setImporting(true)
      try {
        const result = await importAudioFiles(audioFiles, columnSlug)
        if (result.versions.length > 0) await flush()
        setLastCount(result.versions.length)
        return { imported: result.versions.length, duplicates: result.duplicates }
      } finally {
        inFlightRef.current = false
        setImporting(false)
      }
    },
    [defaultColumn],
  )

  return { importing, lastCount, importFiles }
}
