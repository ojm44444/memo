import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/* First-touch attribution onto a newly created account (see lib/attribution).
   Loaded after the client, off the critical path, and it can never throw
   into sign-in. */
if (supabase) {
  const client = supabase
  void import('@/lib/attribution')
    .then((m) => m.watchForNewAccount(client))
    .catch(() => {})
}
