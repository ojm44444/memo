import { useEffect, useRef, useState } from 'react'
import { updateSong } from '@/db/repositories/boardRepo'

/**
 * The words, kept with the recording.
 *
 * Most requested thing across twelve r/Songwriting threads, ahead of search,
 * merge and sharing. The hack it replaces is an Apple Note holding a voice
 * memo link with chords typed above the lyrics.
 *
 * Two decisions that matter, both from what people actually do:
 *
 * 1. MONOSPACE AND WHITESPACE PRESERVED. A chord chart is positioned with
 *    spaces - the G has to sit above the word you change on. A proportional
 *    font or any whitespace collapsing makes the field useless for the single
 *    most common way people write this down.
 *
 * 2. NOTHING CLEVER. No rhyming dictionary, no structure detection, no
 *    generation. That audience is openly hostile to AI writing lyrics, and the
 *    ask was never cleverness: it was keeping the words next to the take.
 */
export function LyricsEditor({ songId, initial }: { songId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? '')
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | null>(null)
  const lastSaved = useRef(initial ?? '')

  useEffect(() => {
    setValue(initial ?? '')
    lastSaved.current = initial ?? ''
  }, [initial, songId])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const scheduleSave = (next: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (next === lastSaved.current) return
      lastSaved.current = next
      void updateSong(songId, { lyrics: next.length ? next : null }).then(() => {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1600)
      })
    }, 700)
  }

  const lineCount = value ? value.split('\n').length : 0

  return (
    <div className="lyrics">
      <div className="lyrics-head">
        <span className="lyrics-label">Lyrics</span>
        <span className="lyrics-status">
          {saved ? 'Saved' : lineCount > 0 ? `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}` : ''}
        </span>
      </div>
      <textarea
        className="lyrics-field"
        value={value}
        spellCheck={false}
        placeholder={'Verse 1\nG            C\nWords go here, chords above them'}
        aria-label="Lyrics and chords for this song"
        onChange={(e) => {
          setValue(e.target.value)
          scheduleSave(e.target.value)
        }}
        onBlur={() => {
          if (timer.current) window.clearTimeout(timer.current)
          if (value !== lastSaved.current) {
            lastSaved.current = value
            void updateSong(songId, { lyrics: value.length ? value : null })
          }
        }}
      />
      <p className="lyrics-hint">
        Spacing is kept exactly as you type it, so chords stay above the right word.
      </p>
    </div>
  )
}
