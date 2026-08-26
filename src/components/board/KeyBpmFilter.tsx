import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  getBpmRange,
  getKeyFilter,
  getSongSortMode,
  setBpmRange,
  setKeyFilter,
  setSongSortMode,
} from '@/db/repositories/projectRepo'

/**
 * "Every idea in D at 92bpm."
 *
 * Key and BPM were already read off file tags and shown on cards, but nothing
 * could sort or filter by them, which is the exact thing the r/Songwriting
 * thread asked for. Only keys actually present in the library are offered:
 * a dropdown of all 24 keys when the board holds three would be a lie about
 * what is in there.
 */
export function KeyBpmFilter() {
  const keys = useLiveQuery(async () => {
    const songs = await db.songs.filter((s) => !s.deletedAt && !!s.musicalKey).toArray()
    return [...new Set(songs.map((s) => s.musicalKey!))].sort()
  }, [])

  const activeKey = useLiveQuery(() => getKeyFilter(), [])
  const bpm = useLiveQuery(() => getBpmRange(), [])
  const sortMode = useLiveQuery(() => getSongSortMode(), [])

  // Nothing tagged yet: offering the control would imply data that is not there.
  if (!keys || keys.length === 0) return null

  return (
    <div className="keybpm-filter">
      <label className="keybpm-field">
        <span className="keybpm-label">Key</span>
        <select
          value={activeKey ?? ''}
          onChange={(e) => void setKeyFilter(e.target.value || null)}
          aria-label="Filter by musical key"
        >
          <option value="">Any</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="keybpm-field">
        <span className="keybpm-label">BPM</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="min"
          value={bpm?.min ?? ''}
          aria-label="Minimum BPM"
          onChange={(e) =>
            void setBpmRange(e.target.value ? Number(e.target.value) : null, bpm?.max ?? null)
          }
        />
        <span className="keybpm-dash">–</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="max"
          value={bpm?.max ?? ''}
          aria-label="Maximum BPM"
          onChange={(e) =>
            void setBpmRange(bpm?.min ?? null, e.target.value ? Number(e.target.value) : null)
          }
        />
      </label>

      <label className="keybpm-field">
        <span className="keybpm-label">Sort</span>
        <select
          value={sortMode ?? 'board'}
          onChange={(e) =>
            void setSongSortMode(e.target.value as 'board' | 'recent' | 'key' | 'bpm')
          }
          aria-label="Sort songs by"
        >
          <option value="board">Board order</option>
          <option value="recent">Recently edited</option>
          <option value="key">Key</option>
          <option value="bpm">Tempo</option>
        </select>
      </label>
    </div>
  )
}
