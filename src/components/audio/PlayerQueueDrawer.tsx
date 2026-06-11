import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/stores/playerStore'

export function PlayerQueueDrawer() {
  const {
    queueOpen,
    setQueueOpen,
    playlist,
    currentIndex,
    queueFocusIndex,
    playlistSource,
    jumpToQueueIndex,
    setQueueFocusIndex,
    moveQueueItem,
    removeFromQueue,
    clearQueue,
    shuffleQueue,
    playNextInQueue,
    playPreviousInQueue,
    playQueueFromStart,
    playQueueFromEnd,
    queueRepeat,
    toggleQueueRepeat,
  } = usePlayerStore()

  const atStart = currentIndex === 0
  const atEnd = currentIndex >= playlist.length - 1
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex < playlist.length - 1
  const panelRef = useRef<HTMLDivElement | null>(null)
  const focusItemRef = useRef<HTMLLIElement | null>(null)
  const [focusAnnouncement, setFocusAnnouncement] = useState('')

  useEffect(() => {
    if (!queueOpen) return
    focusItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [queueOpen, queueFocusIndex])

  useEffect(() => {
    if (!queueOpen) return

    const panel = panelRef.current
    if (!panel) return

    const getFocusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

    const focusInitial = () => {
      const focusedPlay = focusItemRef.current?.querySelector<HTMLElement>('.player-queue-play')
      const fallback = getFocusables()[0]
      ;(focusedPlay ?? fallback)?.focus()
    }

    const frame = requestAnimationFrame(focusInitial)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusables = getFocusables()
      if (!focusables.length) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [queueOpen])

  useEffect(() => {
    if (!queueOpen) {
      setFocusAnnouncement('')
      return
    }
    const item = playlist[queueFocusIndex]
    if (!item) return
    const position = `track ${queueFocusIndex + 1} of ${playlist.length}`
    const playing = queueFocusIndex === currentIndex ? ', now playing' : ''
    setFocusAnnouncement(`${item.songTitle || 'Untitled'}, ${position}${playing}`)
  }, [queueOpen, queueFocusIndex, currentIndex, playlist])

  if (!queueOpen || playlist.length === 0) return null

  const title =
    playlistSource === 'favourites' ? 'Favourites queue' : 'Section queue'

  return (
    <div
      className="player-queue-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-queue-title"
      aria-describedby="player-queue-kbd-hint"
    >
      <button
        type="button"
        className="player-queue-backdrop"
        aria-label="Close queue"
        aria-describedby="player-queue-kbd-hint"
        onClick={() => setQueueOpen(false)}
      />
      <div id="player-queue-panel" className="player-queue-panel" ref={panelRef}>
        <div className="player-queue-header">
          <div className="player-queue-header-text">
            <h2 id="player-queue-title" className="player-queue-title">
              {title}
            </h2>
            <p
              id="player-queue-kbd-hint"
              className="player-queue-kbd-hint"
              aria-labelledby="player-queue-title"
            >
              ↑↓ focus · Del/⌫ remove · Space pause · Esc close
            </p>
          </div>
          <div
            className="player-queue-header-actions"
            role="toolbar"
            aria-labelledby="player-queue-title"
          >
            {!atStart && (
              <button
                type="button"
                className="player-queue-restart"
                aria-label="Start queue from first track"
                onClick={() => playQueueFromStart()}
              >
                Start over
              </button>
            )}
            {hasPrevious && (
              <button
                type="button"
                className="player-queue-previous"
                aria-label="Play previous track in queue"
                onClick={() => playPreviousInQueue()}
              >
                Prev
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                className="player-queue-next"
                aria-label="Play next track in queue"
                onClick={() => playNextInQueue()}
              >
                Next
              </button>
            )}
            {!atEnd && playlist.length > 1 && (
              <button
                type="button"
                className="player-queue-end"
                aria-label="Play last track in queue"
                onClick={() => playQueueFromEnd()}
              >
                Play last
              </button>
            )}
            <button
              type="button"
              className={queueRepeat ? 'player-queue-repeat is-active' : 'player-queue-repeat'}
              aria-pressed={queueRepeat}
              aria-label={queueRepeat ? 'Disable queue repeat' : 'Enable queue repeat'}
              onClick={() => toggleQueueRepeat()}
            >
              Repeat
            </button>
            {playlist.length > 1 && (
              <button
                type="button"
                className="player-queue-shuffle"
                aria-label="Shuffle queue order"
                onClick={() => shuffleQueue()}
              >
                Shuffle
              </button>
            )}
            <button
              type="button"
              className="player-queue-clear"
              aria-label="Clear queue"
              onClick={() => clearQueue()}
            >
              Clear
            </button>
            <button
              type="button"
              className="player-queue-close"
              aria-label="Close queue"
              onClick={() => setQueueOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {focusAnnouncement}
        </p>

        <ol
          className="player-queue-list"
          role="listbox"
          aria-labelledby="player-queue-title"
          aria-activedescendant={`queue-item-${queueFocusIndex}`}
        >
          {playlist.map((item, index) => {
            const trackTitle = item.songTitle || 'Untitled'
            const trackPosition = `track ${index + 1} of ${playlist.length}`
            const trackLabel = `${trackTitle}, ${trackPosition}${
              index === currentIndex ? ', now playing' : ''
            }`

            return (
            <li
              key={`${item.songId}-${item.audioVersionId}-${index}`}
              id={`queue-item-${index}`}
              ref={index === queueFocusIndex ? focusItemRef : null}
              role="option"
              aria-label={trackLabel}
              aria-selected={index === queueFocusIndex}
              className={[
                'player-queue-item',
                index === currentIndex && 'is-current',
                index === queueFocusIndex && 'is-focused',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setQueueFocusIndex(index)}
              onDoubleClick={() => jumpToQueueIndex(index, { keepFocus: true })}
            >
              <button
                type="button"
                className="player-queue-play"
                onClick={() => jumpToQueueIndex(index)}
                aria-label={
                  index === currentIndex
                    ? `Now playing ${trackTitle}, ${trackPosition}`
                    : `Play ${trackTitle}, ${trackPosition}`
                }
              >
                {index === currentIndex ? '▶' : index + 1}
              </button>
              <div className="player-queue-item-main">
                {index === currentIndex && (
                  <span className="player-queue-now-badge">Now playing</span>
                )}
                <button
                  type="button"
                  className="player-queue-label"
                  onClick={() => jumpToQueueIndex(index)}
                  aria-label={`Play ${trackTitle}, ${trackPosition}`}
                >
                  {trackTitle}
                </button>
              </div>
              <div className="player-queue-move">
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move ${trackTitle} up in queue, ${trackPosition}`}
                  onClick={() => moveQueueItem(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index >= playlist.length - 1}
                  aria-label={`Move ${trackTitle} down in queue, ${trackPosition}`}
                  onClick={() => moveQueueItem(index, index + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="player-queue-remove"
                  aria-label={`Remove ${trackTitle} from queue, ${trackPosition}`}
                  onClick={() => removeFromQueue(index)}
                >
                  ✕
                </button>
              </div>
            </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
