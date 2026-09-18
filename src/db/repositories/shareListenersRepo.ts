import { supabase } from '@/lib/supabase/client'

/**
 * Who listened on a share link (046).
 *
 * The listener's side sends an open or a play with an optional name and the
 * browser's time zone. No IP lookups and no third party: the rough place is
 * read from the time zone ("Europe/London" is "London"), and it is only ever
 * as good as that.
 */

export type ShareLinkKind = 'song' | 'collection'
export type ShareListenEvent = 'open' | 'play' | 'name'

/** Shared with the comment box on both share pages, so one name covers both. */
export const LISTENER_NAME_KEY = 'memo-share-author'
const LISTENER_ID_KEY = 'songdrafts-listener-id'

let sessionListenerId: string | null = null

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** A random id for this browser, only so a reopen is not counted twice. */
export function getListenerId(): string {
  try {
    const saved = localStorage.getItem(LISTENER_ID_KEY)
    if (saved && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved
    const fresh = randomId()
    localStorage.setItem(LISTENER_ID_KEY, fresh)
    return fresh
  } catch {
    sessionListenerId ??= randomId()
    return sessionListenerId
  }
}

export function readListenerName(): string {
  try {
    return localStorage.getItem(LISTENER_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function listenerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * "Europe/London" is "London", "America/Los_Angeles" is "Los Angeles",
 * "America/Argentina/Buenos_Aires" is "Buenos Aires". Zones that name no
 * place (UTC, Etc/GMT+5) give null. Mirrors the SQL in 046.
 */
export function placeFromTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone || timeZone.length > 64) return null
  if (!/^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(timeZone)) return null
  if (/^(etc|systemv)\//i.test(timeZone)) return null
  return timeZone.slice(timeZone.lastIndexOf('/') + 1).replace(/_/g, ' ')
}

// The generated types do not know this RPC or table yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = () => supabase as any

/** Fire and forget: a listener never sees an error for this. */
export async function recordShareListener(
  kind: ShareLinkKind,
  token: string,
  event: ShareListenEvent,
  options: { name?: string; password?: string } = {},
): Promise<void> {
  if (!supabase || !token) return
  const { error } = await client().rpc('record_share_listener', {
    p_kind: kind,
    p_token: token,
    p_event: event,
    p_listener_id: getListenerId(),
    p_name: options.name?.trim() || null,
    p_time_zone: listenerTimeZone(),
    p_password: options.password?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export interface ShareListenEventRow {
  listener_id: string
  event: 'open' | 'play'
  listener_name: string | null
  time_zone: string | null
  place: string | null
  created_at: string
}

export interface ShareListener {
  id: string
  name: string | null
  place: string | null
  timeZone: string | null
  lastAt: string
  played: boolean
}

/** One entry per listener, most recent first. Rows arrive newest first. */
export function groupListeners(rows: ShareListenEventRow[]): ShareListener[] {
  const byId = new Map<string, ShareListener>()
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const row of sorted) {
    const seen = byId.get(row.listener_id)
    if (!seen) {
      byId.set(row.listener_id, {
        id: row.listener_id,
        name: row.listener_name,
        place: row.place ?? placeFromTimeZone(row.time_zone),
        timeZone: row.time_zone,
        lastAt: row.created_at,
        played: row.event === 'play',
      })
      continue
    }
    seen.name ??= row.listener_name
    seen.place ??= row.place ?? placeFromTimeZone(row.time_zone)
    seen.timeZone ??= row.time_zone
    if (row.event === 'play') seen.played = true
  }
  return [...byId.values()]
}

export interface SentSongLinkRow {
  id: string
  token: string
  song_id: string
  label: string | null
  created_at: string
  expires_at: string | null
  password_required: boolean
  view_count: number
  listen_count: number
  last_viewed_at: string | null
}

/** Your live single-song links (not revoked, not expired), newest first. */
export async function listSentSongLinks(): Promise<SentSongLinkRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('song_shares')
    .select('id, token, song_id, label, created_at, expires_at, password_hash, view_count, listen_count, last_viewed_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  type Raw = Omit<SentSongLinkRow, 'password_required'> & { password_hash: string | null }
  return ((data ?? []) as unknown as Raw[])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
    .map(({ password_hash, ...row }) => ({
      ...row,
      view_count: row.view_count ?? 0,
      listen_count: row.listen_count ?? 0,
      password_required: password_hash != null,
    }))
}

/** The link's owner only: RLS returns nothing for anyone else. */
export async function listShareListeners(kind: ShareLinkKind, shareId: string): Promise<ShareListener[]> {
  if (!supabase) return []
  const { data, error } = await client()
    .from('share_listen_events')
    .select('listener_id, event, listener_name, time_zone, place, created_at')
    .eq(kind === 'song' ? 'song_share_id' : 'playlist_share_id', shareId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)
  return groupListeners((data ?? []) as ShareListenEventRow[])
}
