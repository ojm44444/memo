import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Listen-into-Write bleed (18 Sept 2026, Owen: "After listening to a
 * playlist, songs on Write started playing"). A Listen playlist ran out and
 * the end-of-queue fallbacks went looking for the next board section. These
 * tests hold the wall between the two sides at the store, where the queue is
 * built and advanced.
 */

const boardSongs: Record<string, Array<{ songId: string; audioVersionId: string; songTitle: string }>> = {
  ideas: [{ songId: 'board-1', audioVersionId: 'bv-1', songTitle: 'Board one' }],
  demos: [{ songId: 'board-2', audioVersionId: 'bv-2', songTitle: 'Board two' }],
}

const buildColumnPlaylist = vi.fn(async (slug: string) => boardSongs[slug] ?? [])

vi.mock('@/lib/audio/buildColumnPlaylist', () => ({
  buildColumnPlaylist: (slug: string) => buildColumnPlaylist(slug),
}))

vi.mock('@/db/repositories/boardRepo', () => ({
  getColumns: vi.fn(async () => [{ slug: 'ideas' }, { slug: 'demos' }]),
  // A Listen track that also lives on the board, the case that made the
  // bleed play the NEXT board section rather than the first.
  getSong: vi.fn(async (id: string) => ({ id, columnSlug: id.startsWith('mix') ? 'ideas' : '__listen__' })),
}))

vi.mock('@/lib/preferences', () => ({
  nextLoopMode: (mode: string) => mode,
  setLoopMode: vi.fn(async () => {}),
}))

const { usePlayerStore } = await import('./playerStore')

const listenItems = [
  { songId: 'mix-1', audioVersionId: 'mv-1', songTitle: 'Master one' },
  { songId: 'listen-2', audioVersionId: 'lv-2', songTitle: 'Master two' },
]

function reset() {
  usePlayerStore.getState().stop()
  usePlayerStore.setState({ loopMode: 'off', queueRepeat: false })
  buildColumnPlaylist.mockClear()
}

describe('a Listen playlist only plays its own tracks', () => {
  beforeEach(reset)

  it('stops at the end instead of moving on to the board', async () => {
    const player = usePlayerStore.getState()
    player.playListen(listenItems, 0)
    expect(usePlayerStore.getState().playlistSource).toBe('listen')

    expect(await usePlayerStore.getState().advanceAtEnd()).toBe(true)
    expect(usePlayerStore.getState().currentSongId).toBe('listen-2')

    expect(await usePlayerStore.getState().advanceAtEnd()).toBe(false)
    const state = usePlayerStore.getState()
    expect(state.isPlaying).toBe(false)
    expect(state.currentSongId).toBe('listen-2')
    expect(state.playlist.map((i) => i.songId)).toEqual(['mix-1', 'listen-2'])
    expect(buildColumnPlaylist).not.toHaveBeenCalled()
  })

  it.each(['section', 'board'] as const)('loop %s goes round the same playlist', async (loopMode) => {
    usePlayerStore.getState().playListen(listenItems, 1)
    usePlayerStore.setState({ loopMode })

    expect(await usePlayerStore.getState().advanceAtEnd()).toBe(true)
    const state = usePlayerStore.getState()
    expect(state.isPlaying).toBe(true)
    expect(state.currentIndex).toBe(0)
    expect(state.currentSongId).toBe('mix-1')
    expect(state.playlistSource).toBe('listen')
    expect(buildColumnPlaylist).not.toHaveBeenCalled()
  })

  it('never re-points the board while it plays, even for a track also on the board', async () => {
    usePlayerStore.getState().playListen(listenItems, 0)
    usePlayerStore.getState().jumpToQueueIndex(1)
    usePlayerStore.getState().playPreviousInQueue()
    await new Promise((r) => setTimeout(r, 0))
    expect(usePlayerStore.getState().activeColumnId).toBe('__listen__')
  })

  it('a queue built with the Listen slug is a Listen queue', async () => {
    usePlayerStore.getState().setPlaylist('__listen__', listenItems, 1)
    usePlayerStore.setState({ isPlaying: true })
    expect(usePlayerStore.getState().playlistSource).toBe('listen')
    expect(await usePlayerStore.getState().advanceAtEnd()).toBe(false)
    expect(buildColumnPlaylist).not.toHaveBeenCalled()
  })

  it('the board cannot be asked to play the Listen side', async () => {
    expect(await usePlayerStore.getState().playColumn('__listen__')).toBe(false)
    expect(buildColumnPlaylist).not.toHaveBeenCalled()
  })
})

describe('board play still moves through the board', () => {
  beforeEach(reset)

  it('moves on to the next section at the end of a column', async () => {
    await usePlayerStore.getState().playColumn('ideas')
    expect(usePlayerStore.getState().playlistSource).toBe('column')

    expect(await usePlayerStore.getState().advanceAtEnd()).toBe(true)
    const state = usePlayerStore.getState()
    expect(state.activeColumnId).toBe('demos')
    expect(state.currentSongId).toBe('board-2')
  })
})
