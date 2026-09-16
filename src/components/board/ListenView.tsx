import { ListenProjects } from './ListenProjects'

/**
 * Listen is its playlists and nothing else (17 Sept, Owen: Starred and the
 * old board playlists are gone; a Listen playlist is the playlist). It does
 * not follow the Songwriting project picker.
 */
export function ListenView() {
  return (
    <div className="listen-view">
      <ListenProjects />
    </div>
  )
}
