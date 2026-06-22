import { useEffect } from 'react'
import { PLAYBACK_RATES } from '@/lib/constants'
import { setDefaultPlaybackRate } from '@/lib/preferences'
import { usePlayerStore } from '@/stores/playerStore'

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function useBoardKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const player = usePlayerStore.getState()

      if (player.queueOpen && event.key === 'Escape') {
        event.preventDefault()
        player.setQueueOpen(false)
        return
      }

      if (player.queueOpen && player.playlist.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          player.setQueueFocusIndex(player.queueFocusIndex + 1)
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          player.setQueueFocusIndex(player.queueFocusIndex - 1)
          return
        }

        if (event.key === 'Home') {
          event.preventDefault()
          player.setQueueFocusIndex(0)
          return
        }

        if (event.key === 'End') {
          event.preventDefault()
          player.setQueueFocusIndex(player.playlist.length - 1)
          return
        }

        if (event.key === 'PageDown') {
          event.preventDefault()
          player.setQueueFocusIndex(player.queueFocusIndex + 5)
          return
        }

        if (event.key === 'PageUp') {
          event.preventDefault()
          player.setQueueFocusIndex(player.queueFocusIndex - 5)
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          player.jumpToQueueIndex(player.queueFocusIndex)
          return
        }

        if (event.key === 'Delete') {
          event.preventDefault()
          player.removeFromQueue(player.queueFocusIndex)
          return
        }

        if (event.key === 'Backspace' && player.queueKeyboardActive) {
          event.preventDefault()
          player.removeFromQueue(player.queueFocusIndex)
          return
        }
      }

      if (event.key === ' ') {
        if (!player.currentSongId) return
        event.preventDefault()
        player.setPlaying(!player.isPlaying)
        return
      }

      if (event.key === 'ArrowRight' && event.shiftKey) {
        if (!player.currentSongId) return
        event.preventDefault()
        void player.playAdjacentColumn('next')
        return
      }

      if (event.key === 'ArrowLeft' && event.shiftKey) {
        if (!player.currentSongId) return
        event.preventDefault()
        void player.playAdjacentColumn('prev')
        return
      }

      if (event.key === 'ArrowRight') {
        if (!player.currentSongId) return
        event.preventDefault()
        player.playNextInColumn()
        return
      }

      if (event.key === 'ArrowLeft') {
        if (!player.currentSongId) return
        event.preventDefault()
        player.playPreviousInColumn()
        return
      }

      const rate = Number(event.key)
      if ((PLAYBACK_RATES as readonly number[]).includes(rate)) {
        event.preventDefault()
        player.setPlaybackRate(rate)
        void setDefaultPlaybackRate(rate)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
