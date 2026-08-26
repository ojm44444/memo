import { useCallback, useRef, useState } from 'react'
import { importAudioFiles } from '@/db/repositories/audioRepo'
import { flush } from '@/sync/syncEngine'
import { extractAudioFiles } from '@/lib/extract-audio-files'
import { trackFirstImport } from '@/lib/analytics'
import { requestStoragePersistence } from '@/lib/storagePersistence'
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
        if (result.versions.length > 0) {
          // Activation moment, fired once per device.
          trackFirstImport(result.versions.length)
          // Ask to be un-evictable now that there is something worth keeping.
          // Requested on import rather than boot: browsers weight the decision
          // on engagement, and this is the first moment the app has earned it.
          void requestStoragePersistence()
          await flush()
        }
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
