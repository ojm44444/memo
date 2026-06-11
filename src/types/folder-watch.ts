export interface FolderWatch {
  key: 'voiceMemos'
  handle: FileSystemDirectoryHandle
  folderName: string
  linkedAt: string
  lastScanAt: string | null
}

export interface ImportedSource {
  sourceKey: string
  fileName: string
  importedAt: string
}
