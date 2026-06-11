import { useState } from 'react'
import { updateSong } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'

interface SongTagsEditorProps {
  songId: string
  initialTags: string[]
}

export function SongTagsEditor({ songId, initialTags }: SongTagsEditorProps) {
  const [tags, setTags] = useState(initialTags)
  const [draft, setDraft] = useState('')

  const saveTags = async (next: string[]) => {
    setTags(next)
    await updateSong(songId, { tags: next })
    scheduleFlush()
  }

  const addTag = async () => {
    const trimmed = draft.trim().toLowerCase()
    if (!trimmed || tags.includes(trimmed)) {
      setDraft('')
      return
    }
    await saveTags([...tags, trimmed])
    setDraft('')
  }

  const removeTag = async (tag: string) => {
    await saveTags(tags.filter((t) => t !== tag))
  }

  return (
    <div className="song-tags-editor">
      <label className="song-detail-label">Tags</label>
      <div className="song-tags-list">
        {tags.map((tag) => (
          <button key={tag} type="button" className="song-tag-pill" onClick={() => void removeTag(tag)}>
            {tag} ×
          </button>
        ))}
      </div>
      <div className="song-tags-add">
        <input
          className="song-tags-input"
          placeholder="Add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addTag()
          }}
        />
        <button type="button" className="song-tags-add-btn" onClick={() => void addTag()}>
          Add
        </button>
      </div>
    </div>
  )
}
