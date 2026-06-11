import { useState, useEffect } from 'react'
import { updateSong } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface NotesEditorProps {
  songId: string
  initialNotes: string
}

export function NotesEditor({ songId, initialNotes }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes)

  useEffect(() => setNotes(initialNotes), [initialNotes])

  const save = async () => {
    await updateSong(songId, { notes })
    scheduleFlush()
  }

  return (
    <div>
      <label className="song-detail-label mb-2 block">Notes & lyrics</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => void save()}
        rows={4}
        placeholder="Key, vibe, lyric fragments…"
        className="song-detail-notes"
      />
    </div>
  )
}
