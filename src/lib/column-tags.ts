const PRESET_TAGS: Record<string, { label: string; className: string }> = {
  inbox: { label: 'New', className: 'song-card-tag-idea' },
  ideas: { label: 'Idea', className: 'song-card-tag-lyric' },
  demos: { label: 'Demo', className: 'song-card-tag-demo' },
  finished: { label: 'Done', className: 'song-card-tag-out' },
}

export function getColumnTag(slug: string) {
  return PRESET_TAGS[slug] ?? { label: 'Track', className: 'song-card-tag-idea' }
}
