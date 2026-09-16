import { supabase } from '@/lib/supabase/client'

/**
 * Google sign-in that says songdrafts.com, free.
 *
 * The redirect flow sends people through Supabase's own address, so Google's
 * screen read "continue to ejwmspvewnkdcwtbofnc.supabase.co". Google's own
 * button runs on our page instead, hands us an ID token, and Supabase accepts
 * that token directly (signInWithIdToken). No custom domain to pay for.
 *
 * Same OAuth client Supabase already uses. It needs our origins listed under
 * Authorised JavaScript origins in Google Cloud, or the button will not load;
 * the caller falls back to the redirect flow when it does not.
 */
/** Flip on once www.songdrafts.com is an Authorised JavaScript origin on the
    client below. Google still draws its button for an unlisted origin and
    then fails on click, so this cannot be detected; it has to be switched. */
export const GOOGLE_BUTTON_ON = false

export const GOOGLE_CLIENT_ID = '640615928143-5bvivvvegjd9ljdhcg3gvnsl63hs3e7f.apps.googleusercontent.com'

type GoogleId = {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleId
  }
}

let loading: Promise<GoogleId> | null = null

function loadScript(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google did not load')))
    script.onerror = () => {
      loading = null
      reject(new Error('Google did not load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

async function sha256Hex(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Draw Google's button into `el`. Resolves false if it cannot, so the caller can show its own. */
export async function renderGoogleButton(
  el: HTMLElement,
  opts: { text: 'signin_with' | 'signup_with' | 'continue_with'; width: number; onError: (message: string) => void },
): Promise<boolean> {
  if (!supabase || !GOOGLE_BUTTON_ON) return false
  try {
    const google = await loadScript()
    const raw = crypto.randomUUID() + crypto.randomUUID()
    const hashed = await sha256Hex(raw)
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashed,
      use_fedcm_for_prompt: true,
      callback: async (response: { credential?: string }) => {
        if (!response.credential || !supabase) return
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce: raw,
        })
        if (error) opts.onError('Google sign-in did not go through. Try again, or use your email.')
      },
    })
    el.replaceChildren()
    google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: opts.text,
      width: opts.width,
      logo_alignment: 'center',
    })
    return true
  } catch {
    return false
  }
}
