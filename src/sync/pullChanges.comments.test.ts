import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression cover for pull clobbering un-pushed comment edits.
 *
 * Songs and audio versions check the outbox before accepting a remote row.
 * Comments only compared syncedAt, which is not the same thing: a comment
 * edited offline keeps its old syncedAt, so the server row looked newer and
 * overwrote the edit. Worse, `!local.syncedAt` forced an overwrite, which
 * targeted exactly the comments the server had never confirmed.
 */

const boardId = 'board-1'

/** Per-table results. Every builder method returns `this`; awaiting resolves. */
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

describe('pullChanges: comments', () => {
  beforeEach(async () => {
    await db.songComments.clear()
    await db.syncQueue.clear()
    await db.songs.clear()
    for (const key of Object.keys(tableResults)) delete tableResults[key]

    // The comments block only runs when the board has at least one live song.
    await db.songs.put({
      id: 'song-1',
      title: 'Poem',
      columnSlug: 'inbox',
      projectId: null,
      tags: [],
      isFavourite: false,
      musicalKey: null,
      bpm: null,
      sortOrder: 0,
      notes: '',
      recordedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      deletedAt: null,
    })
  })

  const remoteComment = (body: string, updatedAt: string) => ({
    id: 'comment-1',
    song_id: 'song-1',
    user_id: 'user-1',
    author_label: 'Owen',
    body,
    timestamp_ms: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: updatedAt,
    deleted_at: null,
  })

  const localComment = (body: string, syncedAt: string | null) => ({
    id: 'comment-1',
    songId: 'song-1',
    userId: 'user-1',
    authorLabel: 'Owen',
    body,
    timestampMs: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    syncedAt,
    deletedAt: null,
  })

  it('keeps an un-pushed local edit instead of overwriting it', async () => {
    await db.songComments.put(localComment('my offline edit', '2026-01-01T00:00:00.000Z'))
    await db.syncQueue.add({
      id: 'q1',
      op: 'update',
      entityType: 'song_comment',
      entityId: 'comment-1',
      payload: '{}',
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    })

    // Server row is newer, and would have won before the fix.
    tableResults['song_comments'] = {
      data: [remoteComment('server version', '2026-06-01T00:00:00.000Z')],
      error: null,
    }

    await pullChanges('user-1')

    expect((await db.songComments.get('comment-1'))?.body).toBe('my offline edit')
  })

  it('does not resurrect a comment with a pending local delete', async () => {
    await db.songComments.put(localComment('going away', '2026-01-01T00:00:00.000Z'))
    await db.syncQueue.add({
      id: 'q2',
      op: 'delete',
      entityType: 'song_comment',
      entityId: 'comment-1',
      payload: '{}',
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    })

    tableResults['song_comments'] = {
      data: [remoteComment('still on server', '2026-06-01T00:00:00.000Z')],
      error: null,
    }

    await pullChanges('user-1')

    expect((await db.songComments.get('comment-1'))?.body).toBe('going away')
  })

  it('does not discard a comment the server has never confirmed', async () => {
    // syncedAt null used to force an overwrite, which is backwards.
    await db.songComments.put(localComment('never synced', null))
    tableResults['song_comments'] = {
      data: [remoteComment('server version', '2026-06-01T00:00:00.000Z')],
      error: null,
    }

    await pullChanges('user-1')

    expect((await db.songComments.get('comment-1'))?.body).toBe('never synced')
  })

  it('still accepts a remote comment when nothing local is pending', async () => {
    await db.songComments.put(localComment('old local', '2026-01-01T00:00:00.000Z'))
    tableResults['song_comments'] = {
      data: [remoteComment('legitimate update', '2026-06-01T00:00:00.000Z')],
      error: null,
    }

    await pullChanges('user-1')

    expect((await db.songComments.get('comment-1'))?.body).toBe('legitimate update')
  })
})
