import { useEffect, useRef } from 'react'
import {
  classifyDropFailure,
  extractAudioFiles,
  getFilesFromDataTransferAsync,
  getFilesFromDataTransferSync,
  isFileDragEvent,
  type DropRejectReason,
} from '@/lib/extract-audio-files'
import type { ColumnSlug } from '@/types/column'

const FILE_DROP_TARGET: ColumnSlug = 'inbox'

interface UseGlobalFileDropOptions {
  enabled?: boolean
  onDragStateChange?: (active: boolean, columnSlug: ColumnSlug | null) => void
  onImport: (files: File[], columnSlug: ColumnSlug) => void | Promise<void>
  onImportFailed?: (reason: DropRejectReason) => void
}

export function useGlobalFileDrop({
  enabled = true,
  onDragStateChange,
  onImport,
  onImportFailed,
}: UseGlobalFileDropOptions) {
  const onImportRef = useRef(onImport)
  const onDragStateRef = useRef(onDragStateChange)
  const onImportFailedRef = useRef(onImportFailed)

  useEffect(() => {
    onImportRef.current = onImport
    onDragStateRef.current = onDragStateChange
    onImportFailedRef.current = onImportFailed
  })

  useEffect(() => {
    if (!enabled) return

    const setDragState = (active: boolean) => {
      document.body.classList.toggle('is-file-dragging', active)
      onDragStateRef.current?.(active, active ? FILE_DROP_TARGET : null)
    }

    const allowDrop = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return false
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      return true
    }

    const onDragEnter = (event: DragEvent) => {
      if (!allowDrop(event)) return
      setDragState(true)
    }

    const onDragOver = (event: DragEvent) => {
      if (!allowDrop(event)) return
      setDragState(true)
    }

    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setDragState(false)

      const dt = event.dataTransfer
      if (!dt) {
        onImportFailedRef.current?.('empty')
        return
      }

      const syncRaw = getFilesFromDataTransferSync(dt)
      const syncAudio = extractAudioFiles(syncRaw)
      if (syncAudio.length > 0) {
        void onImportRef.current(syncAudio, FILE_DROP_TARGET)
        return
      }

      void (async () => {
        const rawFiles = await getFilesFromDataTransferAsync(dt)
        const audioFiles = extractAudioFiles(rawFiles)

        if (audioFiles.length > 0) {
          await onImportRef.current(audioFiles, FILE_DROP_TARGET)
          return
        }

        onImportFailedRef.current?.(classifyDropFailure(rawFiles.length ? rawFiles : syncRaw, dt))
      })()
    }

    const onDragEnd = () => setDragState(false)

    const targets: EventTarget[] = [window, document, document.body]

    for (const target of targets) {
      target.addEventListener('dragenter', onDragEnter as EventListener, true)
      target.addEventListener('dragover', onDragOver as EventListener, true)
      target.addEventListener('drop', onDrop as EventListener, true)
    }
    window.addEventListener('dragend', onDragEnd, true)

    return () => {
      document.body.classList.remove('is-file-dragging')
      for (const target of targets) {
        target.removeEventListener('dragenter', onDragEnter as EventListener, true)
        target.removeEventListener('dragover', onDragOver as EventListener, true)
        target.removeEventListener('drop', onDrop as EventListener, true)
      }
      window.removeEventListener('dragend', onDragEnd, true)
    }
  }, [enabled])
}
