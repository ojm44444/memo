import { useState } from 'react'
import { updateSong } from '@/db/repositories/boardRepo'
import { scheduleFlush } from '@/sync/syncEngine'
import { PRESET_TAGS, getTagGradient } from '@/lib/tagColors'

interface SongTagsEditorProps {
  songId: string
  initialTags: string[]
}

export function SongTagsEditor({ songId, initialTags }: SongTagsEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [draft, setDraft] = useState('')

  const saveTags = async (next: string[]) => {
    setTags(next)
    await updateSong(songId, { tags: next })
    scheduleFlush()
  }

  const togglePreset = async (tag: string) => {
    const active = tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    if (active) {
      await saveTags(tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()))
    } else {
      await saveTags([...tags, tag])
    }
  }

  const removeCustom = async (tag: string) => {
    await saveTags(tags.filter((t) => t !== tag))
  }

  const addCustom = async () => {
    const trimmed = draft.trim()
    if (!trimmed || tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    await saveTags([...tags, trimmed])
    setDraft('')
  }

  const customTags = tags.filter(
    (t) => !PRESET_TAGS.some((p) => p.toLowerCase() === t.toLowerCase()),
  )

  return (
    <div className="song-tags-editor">
      <label className="song-detail-label">Tags</label>
      <div className="song-tags-presets">
        {PRESET_TAGS.map((tag) => {
          const active = tags.some((t) => t.toLowerCase() === tag.toLowerCase())
          const gradient = getTagGradient(tag)
          return (
            <button
              key={tag}
              type="button"
              className={`song-tag-pill${active ? ' is-active' : ''}`}
              style={
                active
                  ? ({ background: gradient, '--tag-gradient': gradient } as React.CSSProperties)
                  : ({ '--tag-gradient': gradient } as React.CSSProperties)
              }
              onClick={() => void togglePreset(tag)}
            >
              {tag}
            </button>
          )
        })}
        {customTags.map((tag) => {
          const gradient = getTagGradient(tag)
          return (
            <button
              key={tag}
              type="button"
              className="song-tag-pill is-active"
              style={{ background: gradient } as React.CSSProperties}
              onClick={() => void removeCustom(tag)}
            >
              {tag} ×
            </button>
          )
        })}
      </div>
      <div className="song-tags-add">
        <input
          className="song-tags-input"
          placeholder="Add custom tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addCustom()
          }}
        />
        <button type="button" className="song-tags-add-btn" onClick={() => void addCustom()}>
          Add
        </button>
      </div>
    </div>
  )
}
