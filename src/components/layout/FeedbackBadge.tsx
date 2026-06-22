import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { getUnseenFeedbackSongIds, markFeedbackSeen } from '@/db/repositories/shareFeedbackRepo'
import { getSong } from '@/db/repositories/boardRepo'
import { useUiStore } from '@/stores/uiStore'

export function FeedbackBadge() {
  const [unseenIds, setUnseenIds] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const { openDrawer } = useUiStore()

  // Re-check whenever the feedback cache changes
  const cacheVersion = useLiveQuery(async () => (await db.syncMeta.get('shareFeedbackCache'))?.value, [])

  useEffect(() => {
    void getUnseenFeedbackSongIds().then(setUnseenIds)
  }, [cacheVersion])

  if (unseenIds.length === 0) return null

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen((v) => !v)
  }

  const handleClick = async (songId: string) => {
    await markFeedbackSeen(songId)
    setUnseenIds((ids) => ids.filter((id) => id !== songId))
    setOpen(false)
    openDrawer(songId)
  }

  return (
    <div className="feedback-badge-wrap">
      <button type="button" className="feedback-badge-btn" onClick={handleOpen} title="New listener feedback">
        💬 <span className="feedback-badge-count">{unseenIds.length}</span>
      </button>
      {open && (
        <FeedbackDropdown songIds={unseenIds} onSelect={handleClick} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}

function FeedbackDropdown({
  songIds,
  onSelect,
  onClose,
}: {
  songIds: string[]
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [songs, setSongs] = useState<Array<{ id: string; title: string }>>([])

  useEffect(() => {
    void Promise.all(songIds.map((id) => getSong(id))).then((results) => {
      setSongs(results.filter(Boolean).map((s) => ({ id: s!.id, title: s!.title })))
    })

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [songIds, onClose])

  return (
    <>
      <div className="feedback-backdrop" onClick={onClose} />
      <div className="feedback-dropdown">
        <p className="feedback-dropdown-label">New listener feedback</p>
        {songs.map((s) => (
          <button
            key={s.id}
            type="button"
            className="feedback-dropdown-item"
            onClick={() => onSelect(s.id)}
          >
            <span className="feedback-dropdown-icon">💬</span>
            <span className="feedback-dropdown-title">{s.title}</span>
          </button>
        ))}
      </div>
    </>
  )
}
