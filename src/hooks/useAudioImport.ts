import { useCallback, useRef, useState } from 'react'
import { importAudioFiles } from '@/db/repositories/audioRepo'
import { flush } from '@/sync/syncEngine'
import { extractAudioFiles } from '@/lib/extract-audio-files'
import { trackFirstImport, recordEvent } from '@/lib/analytics'
import { trackPixelCustomEvent } from '@/lib/metaPixel'
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
      // The import is the step most likely to lose someone (the iPhone route
      // is several taps), so it is measured on its own. A count, nothing else.
      trackPixelCustomEvent('ImportStarted', { num_items: audioFiles.length })
      try {
        const result = await importAudioFiles(audioFiles, columnSlug)
        if (result.versions.length > 0) {
          trackPixelCustomEvent('ImportCompleted', { num_items: result.versions.length })
          // Activation moment, fired once per device.
          trackFirstImport(result.versions.length)
          void recordEvent('import_completed', result.versions.length)
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
