import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression cover for the duplicate "My Project".
 *
 * Owen's account collected eight empty ones, one per machine he opened
 * songdrafts on, and the project switcher showed the same name twice with
 * nothing on screen telling them apart. Two bugs made it, and each one alone
 * would have been harmless:
 *
 *  1. ensureDefaultProject invents a local project when this browser's
 *     database is empty, and deliberately does NOT enqueue it, so it cannot
 *     race the first pull. Correct on its own.
 *  2. The pull's cleanup removed stand-in projects by looking for unpushed
 *     outbox `create` entries. The placeholder has none, by design, so the
 *     cleanup could never see the one thing it existed to remove.
 *
 * Then bootstrapProjects uploaded every local project on every push and the
 * stand-in became permanent. These tests cover the pull half.
 */

const boardId = 'board-1'

const tableResults: Record<string, { data: unknown; error: null }> = {}

function makeBuilder(table: string) {
  const result = tableResults[table] ?? { data: [], error: null }
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  }
  for (const m of ['select', 'eq', 'gt', 'in', 'is', 'order', 'limit']) {
    builder[m] = () => builder
  }
  return builder
}

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
  supabaseConfigured: true,
}))

vi.mock('@/lib/supabase/boardAccess', () => ({
  resolveBoardId: () => Promise.resolve(boardId),
}))

const { db } = await import('@/db/database')
const { pullChanges } = await import('@/sync/pullChanges')
const {
  PLACEHOLDER_PROJECT_KEY,
  getActiveProjectId,
} = await import('@/db/repositories/projectRepo')

const remoteProject = (id: string, name: string, position = 0) => ({
  id,
  board_id: boardId,
  name,
  position,
  created_at: '2026-06-14T08:39:08.540Z',
  updated_at: '2026-06-14T08:39:08.540Z',
  deleted_at: null,
})

async function addLocalProject(id: string, name: string) {
  await db.projects.add({ id, name, sortOrder: 0, createdAt: new Date().toISOString() })
}

async function markAsPlaceholder(id: string) {
  await db.syncMeta.put({ key: PLACEHOLDER_PROJECT_KEY, value: id })
}

describe('pullChanges: the placeholder project', () => {
  beforeEach(async () => {
    await db.projects.clear()
    await db.songs.clear()
    await db.syncQueue.clear()
    await db.syncMeta.clear()
    for (const key of Object.keys(tableResults)) delete tableResults[key]
  })

  it('removes the placeholder once the server says what the account has', async () => {
    await addLocalProject('local-placeholder', 'My Project')
    await markAsPlaceholder('local-placeholder')
    tableResults.projects = {
      data: [remoteProject('cloud-1', 'My Project'), remoteProject('cloud-2', 'Omellette', 1)],
      error: null,
    }

    await pullChanges('user-1')

    expect(await db.projects.get('local-placeholder')).toBeUndefined()
    expect((await db.syncMeta.get(PLACEHOLDER_PROJECT_KEY))?.value).toBeUndefined()
  })

  it('moves the placeholder\'s songs to the remote project of the same name', async () => {
    await addLocalProject('local-placeholder', 'My Project')
    await markAsPlaceholder('local-placeholder')
    await db.syncMeta.put({ key: 'activeProjectId', value: 'local-placeholder' })
    await db.songs.put({
      id: 'song-1',
      title: 'Kitchen at 2am',
      columnSlug: 'inbox',
      projectId: 'local-placeholder',
      tags: [],
      isFavourite: false,
      musicalKey: null,
      bpm: null,
      recordedAt: null,
      sortOrder: 0,
      notes: '',
      lyrics: null,
      tuning: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncedAt: null,
      deletedAt: null,
    })
    tableResults.projects = {
      data: [remoteProject('cloud-1', 'My Project'), remoteProject('cloud-2', 'Omellette', 1)],
      error: null,
    }

    await pullChanges('user-1')

    expect((await db.songs.get('song-1'))?.projectId).toBe('cloud-1')
    // ...and the view follows the songs rather than pointing at a deleted id.
    expect(await getActiveProjectId()).toBe('cloud-1')
  })

  it('leaves songs alone when no remote project can be named with certainty', async () => {
    await addLocalProject('local-placeholder', 'Untitled')
    await markAsPlaceholder('local-placeholder')
    await db.songs.put({
      id: 'song-1',
      title: 'Kitchen at 2am',
      columnSlug: 'inbox',
      projectId: 'local-placeholder',
      tags: [],
      isFavourite: false,
      musicalKey: null,
      bpm: null,
      recordedAt: null,
      sortOrder: 0,
      notes: '',
      lyrics: null,
      tuning: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncedAt: null,
      deletedAt: null,
    })
    tableResults.projects = {
      data: [remoteProject('cloud-1', 'My Project'), remoteProject('cloud-2', 'Omellette', 1)],
      error: null,
    }

    await pullChanges('user-1')

    // Guessing here is how a library gets quietly reshuffled.
    expect((await db.songs.get('song-1'))?.projectId).toBe('local-placeholder')
  })

  it('keeps the placeholder when the server has no projects yet', async () => {
    await addLocalProject('local-placeholder', 'My Project')
    await markAsPlaceholder('local-placeholder')
    tableResults.projects = { data: [], error: null }

    await pullChanges('user-1')

    // A genuinely new account: this IS the project, and bootstrapProjects
    // uploads it on the next push.
    expect(await db.projects.get('local-placeholder')).toBeDefined()
  })
})
