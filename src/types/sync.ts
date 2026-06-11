export type SyncOp = 'create' | 'update' | 'delete' | 'upload'

export type SyncEntityType =
  | 'song'
  | 'audio_version'
  | 'song_link'
  | 'song_comment'
  | 'board'
  | 'column'
  | 'project'

export interface SyncQueueItem {
  id: string
  op: SyncOp
  entityType: SyncEntityType
  entityId: string
  payload: string
  createdAt: string
  attempts: number
  lastError: string | null
}
