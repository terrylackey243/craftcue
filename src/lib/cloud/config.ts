// Build-time switches for accounts and sync. A build without a server address is the original
// on-device-only app (the public GitHub Pages build, until hosted Supabase is attached).
//
//   VITE_SUPABASE_URL              server address, or "same-origin" when the API is proxied under
//                                  the app's own host (the homelab setup)
//   VITE_SUPABASE_PUBLISHABLE_KEY  the project's publishable (anon) key: public by design
//   VITE_SIGNUP                    "open" (default) or "closed" (existing accounts can sign in)
//   VITE_AUTH_METHOD               "password" (default) or "otp" (6-digit email code)
//   VITE_BEHIND_ACCESS             "true" when a login proxy (Cloudflare Access) sits in front

const env = import.meta.env as Record<string, string | undefined>

function resolveUrl(raw: string | undefined): string {
  if (!raw) return ''
  if (raw === 'same-origin') return typeof location === 'undefined' ? '' : location.origin
  return raw.replace(/\/+$/, '')
}

export const CLOUD_URL = resolveUrl(env.VITE_SUPABASE_URL)
export const CLOUD_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
export const cloudEnabled = Boolean(CLOUD_URL && CLOUD_KEY)
export const SIGNUP_OPEN = env.VITE_SIGNUP !== 'closed'
export const AUTH_METHOD: 'password' | 'otp' = env.VITE_AUTH_METHOD === 'otp' ? 'otp' : 'password'
export const BEHIND_ACCESS = env.VITE_BEHIND_ACCESS === 'true'
