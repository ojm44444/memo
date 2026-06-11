import { useEffect, useState } from 'react'
import { useAudioImport } from '@/hooks/useAudioImport'
import {
  clearShareImportParam,
  consumeShareImportWithRetry,
  hasShareImportParam,
  isShareImportAlreadyHandled,
  markShareImportHandled,
} from '@/lib/share-import'

/** Consume audio shared to mem• via the system share sheet (PWA share target). */
export function useShareImport() {
  const { importFiles } = useAudioImport('inbox')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const fromShareParam = hasShareImportParam()
      const files = await consumeShareImportWithRetry(fromShareParam ? 8 : 1)
      if (!files.length) return
      if (fromShareParam && isShareImportAlreadyHandled()) return

      const { imported, duplicates } = await importFiles(files, 'inbox')
      if (imported > 0 || duplicates.length > 0) {
        if (fromShareParam) {
          markShareImportHandled()
          clearShareImportParam()
        }
        if (imported > 0) {
          setMessage(
            imported === 1
              ? 'Shared memo added to Inbox'
              : `${imported} shared memos added to Inbox`,
          )
        } else if (duplicates.length > 0) {
          setMessage(
            duplicates.length === 1
              ? `Already imported: ${duplicates[0]}`
              : `${duplicates.length} shared files already imported`,
          )
        }
      }
    }

    void run()
  }, [importFiles])

  return { shareImportMessage: message, clearShareImportMessage: () => setMessage(null) }
}
