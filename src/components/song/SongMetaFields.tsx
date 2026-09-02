import { useEffect, useState } from 'react'
import { updateSong } from '@/db/repositories/boardRepo'
import type { Song } from '@/types/song'

/**
 * Key, tempo and tuning. One row, three fields, deliberately not a panel.
 *
 * Key and BPM are read off a DAW bounce automatically, but a raw voice memo
 * carries neither, so they have to be editable by hand (Owen's ask). Tuning
 * can never be read off a file at all.
 *
 * TUNING EARNS ITS PLACE from the most vivid failure in the research: someone
 * spent 50 hours on a guitar piece in an alternate tuning, made 70
 * near-identical memos, never wrote the tuning down, and cannot play the piece
 * any more.
 *
 * Held to three fields on purpose. A senior audio commenter in the same
 * research warned that heavy metadata entry becomes a duplicate database
 * problem: more typing, more conflict, less use. So: no panel, no taxonomy,
 * no required fields.
 *
 * THE PLACEHOLDERS SAY "e.g." NOW. They used to read "Am", "92", "DADGAD",
 * which is what a filled-in field looks like, and there was no ::placeholder
 * rule so they rendered barely dimmer than a real value. Every card in an
 * audit of 241 songs appeared to be in A minor at 92bpm in DADGAD, and all
 * three fields were empty on every one of them. On a page whose whole
 * position is that it does not tell you things that are not true, a field
 * that looks answered when it is blank is the same failure in miniature.
 */
export function SongMetaFields({ song }: { song: Song }) {
  const [key, setKey] = useState(song.musicalKey ?? '')
  const [bpm, setBpm] = useState(song.bpm != null ? String(song.bpm) : '')
  const [tuning, setTuning] = useState(song.tuning ?? '')

  useEffect(() => {
    setKey(song.musicalKey ?? '')
    setBpm(song.bpm != null ? String(song.bpm) : '')
    setTuning(song.tuning ?? '')
  }, [song.id, song.musicalKey, song.bpm, song.tuning])

  const commit = (patch: Parameters<typeof updateSong>[1]) => {
    void updateSong(song.id, patch)
  }

  return (
    <div className="song-meta">
      <label className="song-meta-field">
        <span>Key</span>
        <input
          value={key}
          placeholder="e.g. Am"
          maxLength={12}
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => commit({ musicalKey: key.trim() || null })}
        />
      </label>

      <label className="song-meta-field">
        <span>Tempo</span>
        <input
          value={bpm}
          placeholder="e.g. 92"
          inputMode="numeric"
          maxLength={3}
          onChange={(e) => setBpm(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            const n = parseInt(bpm, 10)
            commit({ bpm: Number.isFinite(n) && n > 0 ? n : null })
          }}
        />
      </label>

      <label className="song-meta-field song-meta-field--wide">
        <span>Tuning</span>
        <input
          value={tuning}
          placeholder="e.g. DADGAD"
          maxLength={24}
          onChange={(e) => setTuning(e.target.value)}
          onBlur={() => commit({ tuning: tuning.trim() || null })}
        />
      </label>
    </div>
  )
}
