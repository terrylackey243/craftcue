import { Link } from 'react-router-dom'
import { useAccount } from '../hooks'
import { reconnect, syncNow } from '../lib/cloud/account'
import { Button } from './ui'

const LABELS = {
  idle: { icon: '☁️', text: 'Synced' },
  syncing: { icon: '🔄', text: 'Syncing…' },
  offline: { icon: '📴', text: 'Offline' },
  reconnect: { icon: '🔒', text: 'Reconnect' },
  error: { icon: '⚠️', text: 'Not synced' },
} as const

/** Small header badge; tapping it opens the account settings. */
export function SyncBadge() {
  const a = useAccount()
  if (a.sync === 'off' || a.sync === 'signed-out') return null
  const l = a.sync === 'idle' && a.pending > 0 ? { icon: '⏳', text: 'Not synced yet' } : LABELS[a.sync]
  return (
    <Link
      to="/settings#account"
      className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
      aria-label={`Sync status: ${l.text}${a.pending ? `, ${a.pending} changes waiting` : ''}`}
    >
      <span aria-hidden>{l.icon}</span>
      <span className="hidden sm:inline">{l.text}</span>
    </Link>
  )
}

/** Banner for states the user needs to act on. */
export function SyncBanner() {
  const a = useAccount()
  if (a.sync === 'reconnect') {
    return (
      <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Your sign-in timed out.</strong> Your changes are safe on this device. Tap to reconnect and they'll sync.
        </p>
        <Button onClick={reconnect}>Reconnect</Button>
      </div>
    )
  }
  if (a.sync === 'error' && a.error) {
    return (
      <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
        <p>{a.error}</p>
        <Button variant="secondary" onClick={() => void syncNow()}>
          Try again
        </Button>
      </div>
    )
  }
  return null
}
