import type { AudioVersion } from '@/types/audio-version'
import type { Column } from '@/types/column'
import type { Project } from '@/types/project'
import type { Song, SongLink } from '@/types/song'
import type { SongComment } from '@/types/song-comment'

export const BACKUP_VERSION = 1

export type BackupAudioVersion = AudioVersion & {
  audioFile?: string | null
}

export interface BackupManifest {
  version: number
  exportedAt: string
  projects: Project[]
  columns: Column[]
  songs: Song[]
  versions: BackupAudioVersion[]
  links: SongLink[]
  comments: SongComment[]
}

export type ImportProgress = {
  phase: 'reading' | 'metadata' | 'audio' | 'finishing'
  done: number
  total: number
  message: string
}

export interface ImportBackupResult {
  mode: 'merge' | 'replace'
  projectsImported: number
  songsImported: number
  audioImported: number
  audioSkipped: number
  linksImported: number
  commentsImported: number
  exportedAt: string
  projectName: string
}
