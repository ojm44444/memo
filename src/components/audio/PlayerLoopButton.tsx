import type { LoopMode } from '@/lib/preferences'
import { usePlayerStore } from '@/stores/playerStore'

const LOOP_LABELS: Record<LoopMode, string> = {
  off: 'Loop off',
  section: 'Loop section',
  board: 'Loop board',
}

export function PlayerLoopButton() {
  const loopMode = usePlayerStore((state) => state.loopMode)
  const cycleLoopMode = usePlayerStore((state) => state.cycleLoopMode)

  return (
    <button
      type="button"
      className={loopMode === 'off' ? 'player-loop-btn' : 'player-loop-btn is-active'}
      onClick={() => cycleLoopMode()}
      aria-label={LOOP_LABELS[loopMode]}
      title={LOOP_LABELS[loopMode]}
    >
      ↻
      <span className="player-loop-label">{loopMode === 'off' ? '' : loopMode}</span>
    </button>
  )
}
