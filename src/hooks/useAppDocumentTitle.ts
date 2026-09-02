import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { getProjectName } from '@/db/repositories/projectRepo'
import { usePageTitle } from './usePageTitle'
import { useUiStore } from '@/stores/uiStore'

/**
 * A tab title that says which board you are on.
 *
 * Every app view carried the marketing title, "songdrafts · Finish more
 * songs", so five tabs of the app were five identical tabs and browser
 * history was useless for getting back to a song. usePageTitle already
 * existed for the marketing routes; this is the app's side of it.
 *
 * The open song wins over the view, because when a card is open that is what
 * the tab is. Falls back to the plain wordmark while the queries are still
 * resolving rather than flashing a half-built string.
 */
export function useAppDocumentTitle() {
  const boardMode = useUiStore((s) => s.boardMode)
  const selectedSongId = useUiStore((s) => s.selectedSongId)

  const projectName = useLiveQuery(() => getProjectName(), [])
  const songTitle = useLiveQuery(
    async () => (selectedSongId ? (await db.songs.get(selectedSongId))?.title ?? null : null),
    [selectedSongId],
  )

  let title = 'songdrafts'
  if (songTitle) title = `${songTitle} · songdrafts`
  else if (boardMode === 'library') title = 'Library · songdrafts'
  else if (boardMode === 'listen') title = 'Listen · songdrafts'
  else if (projectName) title = `${projectName} · songdrafts`

  usePageTitle(title)
}
