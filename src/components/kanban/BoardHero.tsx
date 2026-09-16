import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveProjectId, getProjects } from '@/db/repositories/projectRepo'
import { usePlayerStore } from '@/stores/playerStore'
import { PauseIcon, PlayIcon } from '@/components/ui/Icons'

/**
 * The top of the Songwriting board, in the same voice as Listen (17 Sept):
 * a small count, the project name large in the serif, one white Play.
 */
export function BoardHero({ songCount, stageCount }: { songCount: number; stageCount: number }) {
  const name = useLiveQuery(async () => {
    const [projects, activeId] = await Promise.all([getProjects(), getActiveProjectId()])
    return projects.find((p) => p.id === activeId)?.name ?? 'Songwriting'
  }, [])
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const source = usePlayerStore((s) => s.playlistSource)
  const playingBoard = isPlaying && source === 'column'

  return (
    <header className="board-hero">
      <div>
        <p className="rec-eyebrow">
          {songCount} {songCount === 1 ? 'song' : 'songs'} · {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
        </p>
        <h1 className="board-hero-title">{name ?? ''}</h1>
      </div>
      <button
        type="button"
        className="rec-pill is-primary"
        disabled={songCount === 0}
        onClick={() => {
          const player = usePlayerStore.getState()
          if (playingBoard) player.setPlaying(false)
          else void player.playBoardFromStart()
        }}
      >
        {playingBoard ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        {playingBoard ? 'Pause' : 'Play board'}
      </button>
    </header>
  )
}
