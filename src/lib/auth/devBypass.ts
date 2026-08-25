/**
 * Dev-only auth bypass so the board can be opened locally without a cloud
 * sign-in — used for UI testing against seeded demo data. Never active in
 * production builds (import.meta.env.DEV is compiled false) and never active
 * unless explicitly opted in via localStorage:
 *
 *   localStorage.setItem('memo_dev_bypass', '1'); location.reload()
 *
 * Cloud sync stays fully disabled while bypassed (useSyncAuth early-returns),
 * so nothing ever flushes to Supabase under the fake user.
 */
import type { User } from '@supabase/supabase-js'

export const DEV_BYPASS_KEY = 'memo_dev_bypass'

export function isDevAuthBypass(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    // ?demo=1 lets a headless browser reach the demo board with no prior
    // localStorage, which is what makes the landing-page screenshot
    // reproducible in CI rather than a hand-shot that silently goes stale.
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      localStorage.setItem(DEV_BYPASS_KEY, '1')
      return true
    }
    return localStorage.getItem(DEV_BYPASS_KEY) === '1'
  } catch {
    return false
  }
}

/** True when the URL asks for the marketing-screenshot dressing. */
export function isShotMode(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return new URLSearchParams(window.location.search).get('shot') === '1'
  } catch {
    return false
  }
}

export const DEV_BYPASS_USER = {
  id: 'dev-bypass-user',
  email: 'dev@memo.local',
} as User
