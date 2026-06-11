import { useEffect, useState } from 'react'

const SHORTCUTS = [
  { keys: '⌘ K', label: 'Search songs' },
  { keys: 'Space', label: 'Play / pause' },
  { keys: '← →', label: 'Previous / next song' },
  { keys: 'Shift ← →', label: 'Play previous / next section' },
  { keys: '↻ (player bar)', label: 'Cycle loop: off → section → board' },
  { keys: '1 · 1.5 · 2', label: 'Playback speed' },
  { keys: 'Esc', label: 'Clear search / close drawer' },
  { keys: '?', label: 'Show keyboard shortcuts' },
]

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      event.preventDefault()
      setOpen((value) => !value)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!open) return null

  return (
    <div className="shortcuts-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <button
        type="button"
        className="shortcuts-overlay-backdrop"
        aria-label="Close shortcuts"
        onClick={() => setOpen(false)}
      />
      <div className="shortcuts-panel">
        <div className="shortcuts-panel-header">
          <h2 className="shortcuts-panel-title">Keyboard shortcuts</h2>
          <button type="button" className="shortcuts-panel-close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <ul className="shortcuts-list">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="shortcuts-row">
              <kbd className="shortcuts-kbd">{shortcut.keys}</kbd>
              <span>{shortcut.label}</span>
            </li>
          ))}
        </ul>
        <p className="shortcuts-footnote">Press ? again to close</p>
      </div>
    </div>
  )
}
