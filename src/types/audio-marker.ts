export interface AudioMarker {
  id: string
  versionId: string
  ms: number
  label: string
  type: 'start' | 'end' | 'marker'
}
