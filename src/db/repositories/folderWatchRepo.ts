import { db } from '../database'

export async function getVoiceMemosFolderWatch() {
  return db.folderWatch.get('voiceMemos')
}

export async function saveVoiceMemosFolderWatch(handle: FileSystemDirectoryHandle) {
  const now = new Date().toISOString()
  await db.folderWatch.put({
    key: 'voiceMemos',
    handle,
    folderName: handle.name,
    linkedAt: now,
    lastScanAt: null,
  })
}

export async function clearVoiceMemosFolderWatch() {
  await db.folderWatch.delete('voiceMemos')
}

export async function markFolderScanned() {
  await db.folderWatch.update('voiceMemos', {
    lastScanAt: new Date().toISOString(),
  })
}

export async function getImportedSourceKeys() {
  const rows = await db.importedSources.toArray()
  return new Set(rows.map((row) => row.sourceKey))
}

export async function markSourcesImported(
  entries: { sourceKey: string; fileName: string }[],
) {
  const now = new Date().toISOString()
  await db.importedSources.bulkPut(
    entries.map((entry) => ({
      sourceKey: entry.sourceKey,
      fileName: entry.fileName,
      importedAt: now,
    })),
  )
}
