import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSongsWithMixes } from '@/db/repositories/audioRepo'
import { getListenProjects, listenCoverUrl } from '@/db/repositories/listenProjectRepo'
import { getMyDisplayName } from '@/lib/displayName'
import { formatDuration } from '@/lib/audio-utils'
import { RecordArt } from '@/components/share/RecordParts'
import { PlusIcon } from '@/components/ui/Icons'
import type { ListenProject } from '@/types/listen-project'
import { MixesRoom } from './MixesRoom'
import { MixImport } from './MixImport'
import { ProjectSheet } from './ProjectSheet'
import { SentCollections } from './SentCollections'
import {
  listSavedLinks,
  removeSavedLink,
  savePendingLink,
  type SavedLink,
} from '@/db/repositories/savedLinksRepo'
import { shareCoverUrl } from '@/db/repositories/collectionShareRepo'
import '@/styles/record.css'

/**
 * Listen opens on Projects, never on one of them (Owen, 16 Sept: "it can't
 * just open on something random"). A project is a release: an EP, a single, a
 * session. Click one to get its record view. Stacks not in any project sit in
 * their own tile so nothing that came back from the producer goes missing.
 */
export function ListenProjects() {
  const [openId, setOpenId] = useState<string | 'loose' | null>(null)
  const back = useCallback(() => setOpenId(null), [])

  if (openId) return <MixesRoom projectId={openId === 'loose' ? null : openId} onBack={back} />
  return <ProjectsGrid onOpen={setOpenId} />
}

function ProjectsGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useLiveQuery(() => getListenProjects(), [])
  const stacks = useLiveQuery(() => getSongsWithMixes(), [])
  const [creating, setCreating] = useState(false)
  const [artist, setArtist] = useState('')

  useEffect(() => {
    let live = true
    void getMyDisplayName().then((name) => live && setArtist(name === 'You' ? '' : name))
    return () => {
      live = false
    }
  }, [])

  if (projects === undefined || stacks === undefined) return null

  const statsFor = (id: string | null) => {
    const here = stacks.filter((s) => (s.song.listenProjectId ?? null) === id)
    return { count: here.length, ms: here.reduce((sum, s) => sum + (s.latest.durationMs || 0), 0) }
  }
  const loose = statsFor(null)

  return (
    <div className="rec">
      <header className="rec-projects-head">
        <div>
          <p className="rec-eyebrow">
            {projects.length} {projects.length === 1 ? 'playlist' : 'playlists'}
          </p>
          <h2 className="rec-title">Playlists</h2>
        </div>
        <div className="rec-actions-end">
          <MixImport variant="circle" />
          <button type="button" className="rec-pill is-primary" onClick={() => setCreating(true)}>
            <PlusIcon size={16} />
            New playlist
          </button>
        </div>
      </header>

      {projects.length === 0 && loose.count === 0 ? (
        <button type="button" className="rec-projects-empty" onClick={() => setCreating(true)}>
          <span className="rec-projects-empty-title">Make your first playlist</span>
          <span className="rec-projects-empty-sub">
            An EP, a single, songs for a label. Drop audio in and share it as one link.
          </span>
        </button>
      ) : (
        <ul className="rec-projects">
          {projects.map((project, i) => (
            <ProjectCard
              key={project.id}
              variant={i}
              project={project}
              fallbackArtist={artist}
              stats={statsFor(project.id)}
              onOpen={() => onOpen(project.id)}
            />
          ))}
          {loose.count > 0 && (
            <li>
              <button type="button" className="rec-project" onClick={() => onOpen('loose')}>
                <RecordArt seed="loose" label="" className="is-loose" />
                <span className="rec-project-title">Not in a playlist</span>
                <span className="rec-project-meta">
                  {loose.count} {loose.count === 1 ? 'track' : 'tracks'} · {formatDuration(loose.ms)}
                </span>
              </button>
            </li>
          )}
          <li>
            <button type="button" className="rec-project is-new" onClick={() => setCreating(true)}>
              <span className="rec-project-new">
                <PlusIcon size={28} />
              </span>
              <span className="rec-project-title">New playlist</span>
            </button>
          </li>
        </ul>
      )}

      <SharedWithYou />

      <SentCollections refreshKey={0} />

      {creating && (
        <ProjectSheet
          onClose={() => setCreating(false)}
          onSaved={(project) => {
            setCreating(false)
            onOpen(project.id)
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({
  project,
  fallbackArtist,
  stats,
  onOpen,
  variant,
}: {
  variant: number
  project: ListenProject
  fallbackArtist: string
  stats: { count: number; ms: number }
  onOpen: () => void
}) {
  const [cover, setCover] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void listenCoverUrl(project.coverPath).then((url) => live && setCover(url))
    return () => {
      live = false
    }
  }, [project.coverPath])

  const by = project.artist || fallbackArtist
  return (
    <li>
      <button type="button" className="rec-project" onClick={onOpen}>
        <RecordArt seed={project.id} label="" src={cover} variant={variant} />
        <span className="rec-project-title">{project.title}</span>
        <span className="rec-project-meta">
          {by ? `${by} · ` : ''}
          {stats.count} {stats.count === 1 ? 'track' : 'tracks'}
        </span>
      </button>
    </li>
  )
}

/**
 * Playlists other people shared and this person saved from the link page
 * (17 Sept). Opening one opens the link itself, so the owner's settings
 * (expiry, password, turning it off) still apply.
 */
function SharedWithYou() {
  const [links, setLinks] = useState<SavedLink[] | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    void (async () => {
      await savePendingLink()
      const list = await listSavedLinks()
      if (!live) return
      setLinks(list)
      for (const link of list) {
        if (!link.cover_path) continue
        void shareCoverUrl(link.token)
          .then((url) => live && url && setCovers((prev) => ({ ...prev, [link.token]: url })))
          .catch(() => undefined)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (!links?.length) return null

  return (
    <section className="rec-shared">
      <p className="rec-eyebrow">Shared with you</p>
      <ul className="rec-projects">
        {links.map((link) => (
          <li key={link.token}>
            <a className="rec-project" href={`/playlist/${link.token}`}>
              <RecordArt seed={link.token} label="" src={covers[link.token] ?? null} />
              <span className="rec-project-title">{link.title || 'Untitled'}</span>
              <span className="rec-project-meta">{link.artist || 'Shared playlist'}</span>
            </a>
            <button
              type="button"
              className="rec-shared-remove"
              onClick={() => {
                void removeSavedLink(link.token).then(() => setLinks((prev) => prev?.filter((l) => l.token !== link.token) ?? null))
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
