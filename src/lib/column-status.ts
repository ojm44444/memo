const PRESET_STATUS: Record<string, string> = {
  inbox: 'In Inbox',
  ideas: 'Developing',
  demos: 'In Demo',
  finished: 'Finished',
}

export function getColumnStatus(slug: string, title?: string) {
  return PRESET_STATUS[slug] ?? title ?? 'On board'
}
