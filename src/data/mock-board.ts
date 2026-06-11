import type { Column } from '@/types/column'
import type { Song } from '@/types/song'

export const MOCK_COLUMNS: Column[] = [
  { id: 'col-inbox', slug: 'inbox', title: 'Inbox', sortOrder: 0 },
  { id: 'col-ideas', slug: 'ideas', title: 'Ideas', sortOrder: 1 },
  { id: 'col-demos', slug: 'demos', title: 'Demos', sortOrder: 2 },
  { id: 'col-finished', slug: 'finished', title: 'Finished', sortOrder: 3 },
]

const now = new Date().toISOString()

export const MOCK_SONGS: Song[] = [
  {
    id: 'song-1',
    title: 'the devil u know',
    columnSlug: 'inbox',
    projectId: 'project-mock',
    tags: ['demo'],
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    sortOrder: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
      recordedAt: null,
    deletedAt: null,
  },
  {
    id: 'song-2',
    title: 'Obermättliweg 4',
    columnSlug: 'ideas',
    projectId: 'project-mock',
    tags: [],
    isFavourite: true,
    musicalKey: 'Am',
    bpm: 92,
    sortOrder: 0,
    notes: 'Bridge idea — try the falsetto here',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
      recordedAt: null,
    deletedAt: null,
  },
  {
    id: 'song-3',
    title: 'chorus hook v2',
    columnSlug: 'demos',
    projectId: 'project-mock',
    tags: ['hook'],
    isFavourite: false,
    musicalKey: null,
    bpm: null,
    sortOrder: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    syncedAt: null,
      recordedAt: null,
    deletedAt: null,
  },
]

export const MOCK_DURATIONS: Record<string, number> = {
  'song-1': 118000,
  'song-2': 45000,
  'song-3': 203000,
}
