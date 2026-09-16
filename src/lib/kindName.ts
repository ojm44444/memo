/** What Listen calls a version, by its kind. A plain take shows as a demo. */
export function kindName(kind: string | null | undefined) {
  if (kind === 'master') return 'Master'
  if (kind === 'mix') return 'Mix'
  return 'Demo'
}
