// Accounts and background sync, as one small store the UI subscribes to.
// Everything here is inert in builds without a server (cloudEnabled = false).
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { db, getMeta, outboxListeners, setMeta } from '../../db'
import { AUTH_METHOD, BEHIND_ACCESS, CLOUD_KEY, CLOUD_URL, SIGNUP_OPEN, cloudEnabled } from './config'
import { SupabaseServer } from './server'
import { SyncEngine } from './sync'

export type SyncState = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'reconnect' | 'error'

export interface AccountState {
  ready: boolean
  email: string | null
  userId: string | null
  sync: SyncState
  pending: number
  lastSyncedAt: string | null
  error: string | null
}

let state: AccountState = {
  ready: !cloudEnabled,
  email: null,
  userId: null,
  sync: cloudEnabled ? 'signed-out' : 'off',
  pending: 0,
  lastSyncedAt: null,
  error: null,
}
const listeners = new Set<() => void>()

function set(patch: Partial<AccountState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const accountStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

let clientPromise: Promise<SupabaseClient> | null = null
export function getSupabase(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('Accounts are not available in this version of CraftCue.'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'craftcue-auth', detectSessionInUrl: false } }),
  )
  return clientPromise
}

let engine: SyncEngine | null = null
async function getEngine() {
  engine ??= new SyncEngine(db, new SupabaseServer(await getSupabase()))
  return engine
}

// ----- sync scheduling -----

let timer: ReturnType<typeof setTimeout> | null = null
let interval: ReturnType<typeof setInterval> | null = null

/** Ask for a sync soon (debounced), e.g. after a local change. */
export function requestSync(delayMs = 1500) {
  if (!state.userId) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delayMs)
}

export async function syncNow(): Promise<void> {
  if (!state.userId) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set({ sync: 'offline' })
    return
  }
  set({ sync: 'syncing', error: null })
  try {
    const e = await getEngine()
    await e.sync()
    await (await import('./products')).flushProductQueue()
    set({ sync: 'idle', pending: await e.pendingCount(), lastSyncedAt: await getMeta<string | null>('lastSyncedAt', null) })
  } catch (err) {
    const pending = await db.outbox.count()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return set({ sync: 'offline', pending })
    if (BEHIND_ACCESS && (await accessExpired())) return set({ sync: 'reconnect', pending })
    set({ sync: 'error', pending, error: friendlySyncError(err) })
  }
}

/** Cloudflare Access answers an expired session with a redirect to its login page. */
async function accessExpired(): Promise<boolean> {
  try {
    const res = await fetch(`${CLOUD_URL}/auth/v1/health`, { redirect: 'manual', cache: 'no-store' })
    return res.type === 'opaqueredirect' || res.status === 302 || res.status === 403
  } catch {
    return true
  }
}

/** Full-page trip through the login proxy; the service worker lets /reconnect reach the network. */
export function reconnect() {
  location.href = `/reconnect?back=${encodeURIComponent(location.hash || '#/')}`
}

function friendlySyncError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/JWT|token|not signed in|401/i.test(msg)) return 'Please sign in again.'
  return "Couldn't sync just now. Your changes are saved on this device and will sync later."
}

function startBackgroundSync() {
  if (interval || typeof window === 'undefined') return
  interval = setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  // Push soon after any local change, and show that something is waiting.
  outboxListeners.add(() => {
    // Runs inside the writing transaction; count once it has committed.
    setTimeout(() => void db.outbox.count().then((pending) => set({ pending })), 0)
    requestSync()
  })
}

// ----- session -----

// Sign-in is reported twice (our own call and Supabase's auth event); handle each change once.
let sessionQueue: Promise<void> = Promise.resolve()
function onSession(session: Session | null): Promise<void> {
  sessionQueue = sessionQueue.then(() => (session?.user.id === state.userId && session ? undefined : applySession(session)))
  return sessionQueue
}

async function applySession(session: Session | null) {
  if (!session) {
    set({ ready: true, email: null, userId: null, sync: 'signed-out' })
    return
  }
  const uid = session.user.id
  const previous = await getMeta<string | null>('syncUserId', null)
  if (previous && previous !== uid) {
    // A different account signed in on this device: never mix two people's data.
    await (await getEngine()).clearLocal()
  }
  if (previous !== uid) {
    await (await getEngine()).adoptLocalData()
    await setMeta('syncUserId', uid)
    await setMeta('syncCursor', 0)
  }
  set({ ready: true, email: session.user.email ?? null, userId: uid, pending: await db.outbox.count() })
  startBackgroundSync()
  await syncNow()
}

/** Called once at app start. */
export async function initAccount(): Promise<void> {
  if (!cloudEnabled) return
  const sb = await getSupabase()
  const { data } = await sb.auth.getSession()
  await onSession(data.session)
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') void onSession(null)
    else if (event === 'SIGNED_IN' && session && session.user.id !== state.userId) void onSession(session)
  })
}

// ----- actions used by the screens -----

export const authMethod = AUTH_METHOD
export const signupOpen = SIGNUP_OPEN

function authMessage(err: { message?: string; code?: string } | null): string {
  const m = `${err?.code ?? ''} ${err?.message ?? ''}`
  if (/invalid_credentials|Invalid login/i.test(m)) return "That email and password don't match. Check them and try again."
  if (/signup_disabled|Signups not allowed/i.test(m)) return 'New accounts are turned off on this copy of CraftCue.'
  if (/user_already_exists|already registered/i.test(m)) return 'There is already an account with that email. Sign in instead.'
  if (/weak_password|at least/i.test(m)) return 'Please choose a longer password (at least 8 characters).'
  if (/otp_expired|expired|invalid.*token/i.test(m)) return 'That code has expired or is wrong. Ask for a new one.'
  if (/rate|too many/i.test(m)) return 'Too many tries. Please wait a few minutes and try again.'
  if (/fetch|network/i.test(m)) return "Couldn't reach CraftCue. Check your internet connection."
  return 'Something went wrong. Please try again.'
}

async function afterAuth(session: Session | null) {
  if (session) await onSession(session)
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const sb = await getSupabase()
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return authMessage(error)
  await afterAuth(data.session)
  return null
}

export async function signUpWithPassword(email: string, password: string): Promise<string | null> {
  const sb = await getSupabase()
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
  if (error) return authMessage(error)
  if (!data.session) return 'Check your email to confirm your account, then sign in.'
  await afterAuth(data.session)
  return null
}

export async function sendCode(email: string): Promise<string | null> {
  const sb = await getSupabase()
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: SIGNUP_OPEN } })
  return error ? authMessage(error) : null
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const sb = await getSupabase()
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'email' })
  if (error) return authMessage(error)
  await afterAuth(data.session)
  return null
}

export async function changePassword(password: string): Promise<string | null> {
  if (password.length < 8) return 'Please choose a longer password (at least 8 characters).'
  const sb = await getSupabase()
  const { error } = await sb.auth.updateUser({ password })
  return error ? authMessage(error) : null
}

/** Signs out and removes this account's data from the device (it stays safe in the account). */
export async function signOut(): Promise<void> {
  const sb = await getSupabase()
  await (await getEngine()).clearLocal()
  await sb.auth.signOut({ scope: 'local' })
  await onSession(null)
}

export async function deleteAccount(): Promise<string | null> {
  const sb = await getSupabase()
  try {
    const server = new SupabaseServer(sb)
    await server.deleteAllPhotos()
    const { error } = await sb.rpc('delete_my_account')
    if (error) throw error
  } catch (err) {
    return authMessage(err as { message?: string })
  }
  await (await getEngine()).clearLocal()
  await sb.auth.signOut({ scope: 'local' })
  await onSession(null)
  return null
}
