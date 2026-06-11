import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearVoiceMemosFolderWatch,
  getImportedSourceKeys,
  getVoiceMemosFolderWatch,
  markFolderScanned,
  markSourcesImported,
  saveVoiceMemosFolderWatch,
} from '@/db/repositories/folderWatchRepo'
import { importAudioFiles } from '@/db/repositories/audioRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import {
  pickVoiceMemosFolder,
  scanVoiceMemosFolder,
  supportsVoiceMemosFolderLink,
} from '@/lib/voice-memos-folder'

export function useVoiceMemosFolder() {
  const [linked, setLinked] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastImportCount, setLastImportCount] = useState(0)
  const [stubCount, setStubCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const scannedOnMount = useRef(false)

  const refreshLinkedState = useCallback(async () => {
    const watch = await getVoiceMemosFolderWatch()
    setLinked(Boolean(watch))
    setFolderName(watch?.folderName ?? null)
  }, [])

  const scanNewMemos = useCallback(async () => {
    const watch = await getVoiceMemosFolderWatch()
    if (!watch) return 0

    setScanning(true)
    setError(null)
    setLastImportCount(0)
    setStubCount(0)

    try {
      const { files, stubCount: stubs } = await scanVoiceMemosFolder(watch.handle)
      setStubCount(stubs)

      const imported = await getImportedSourceKeys()
      const fresh = files.filter((entry) => !imported.has(entry.sourceKey))

      if (fresh.length === 0) {
        await markFolderScanned()
        return 0
      }

      await importAudioFiles(
        fresh.map((entry) => entry.file),
        'inbox',
      )
      await markSourcesImported(
        fresh.map((entry) => ({
          sourceKey: entry.sourceKey,
          fileName: entry.file.name,
        })),
      )
      await markFolderScanned()
      scheduleFlush()
      setLastImportCount(fresh.length)
      return fresh.length
    } catch (err) {
      if (err instanceof Error && err.message === 'permission-denied') {
        setError('Folder access expired. Link Voice Memos again.')
        await clearVoiceMemosFolderWatch()
        setLinked(false)
        setFolderName(null)
      } else {
        setError('Could not read that folder. Try linking it again.')
      }
      return 0
    } finally {
      setScanning(false)
    }
  }, [])

  const linkFolder = useCallback(async () => {
    if (!supportsVoiceMemosFolderLink()) {
      setError('Use Chrome or Edge on a Mac for one-click Voice Memos sync.')
      return
    }

    setError(null)
    try {
      const handle = await pickVoiceMemosFolder()
      await saveVoiceMemosFolderWatch(handle)
      setLinked(true)
      setFolderName(handle.name)
      await scanNewMemos()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError('Could not link that folder.')
    }
  }, [scanNewMemos])

  const unlinkFolder = useCallback(async () => {
    await clearVoiceMemosFolderWatch()
    setLinked(false)
    setFolderName(null)
    setLastImportCount(0)
    setStubCount(0)
    setError(null)
  }, [])

  useEffect(() => {
    void refreshLinkedState()
  }, [refreshLinkedState])

  useEffect(() => {
    if (scannedOnMount.current) return
    scannedOnMount.current = true
    void (async () => {
      const watch = await getVoiceMemosFolderWatch()
      if (watch) await scanNewMemos()
    })()
  }, [scanNewMemos])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void (async () => {
        const watch = await getVoiceMemosFolderWatch()
        if (watch) await scanNewMemos()
      })()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [scanNewMemos])

  return {
    supported: supportsVoiceMemosFolderLink(),
    linked,
    folderName,
    scanning,
    lastImportCount,
    stubCount,
    error,
    linkFolder,
    unlinkFolder,
    scanNewMemos,
  }
}
