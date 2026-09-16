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
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
          </p>
          <h2 className="rec-title">Projects</h2>
        </div>
        <div className="rec-actions-end">
          <MixImport variant="circle" />
          <button type="button" className="rec-pill is-primary" onClick={() => setCreating(true)}>
            <PlusIcon size={16} />
            New project
          </button>
        </div>
      </header>

      {projects.length === 0 && loose.count === 0 ? (
        <button type="button" className="rec-projects-empty" onClick={() => setCreating(true)}>
          <span className="rec-projects-empty-title">Make your first project</span>
          <span className="rec-projects-empty-sub">
            An EP, a single, a session. Give it a cover, drop the demos, mixes and masters in, and share it as one link.
          </span>
        </button>
      ) : (
        <ul className="rec-projects">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
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
                <span className="rec-project-title">Not in a project</span>
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
              <span className="rec-project-title">New project</span>
            </button>
          </li>
        </ul>
      )}

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
}: {
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
        <RecordArt seed={project.id} label="" src={cover} />
        <span className="rec-project-title">{project.title}</span>
        <span className="rec-project-meta">
          {by ? `${by} · ` : ''}
          {stats.count} {stats.count === 1 ? 'track' : 'tracks'}
        </span>
      </button>
    </li>
  )
}
