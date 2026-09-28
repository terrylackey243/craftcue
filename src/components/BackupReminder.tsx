import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { useSetup } from '../hooks'
import { exportBackup, reminderState, snoozeReminder } from '../lib/backup'
import { Button } from './ui'

// Gentle nudge after N changes or N days (spec 3.3). Watches the meta table so it updates live.
export default function BackupReminder() {
  const setup = useSetup()
  const state = useLiveQuery(async () => {
    await db.meta.toArray() // subscribe to meta changes
    return setup ? reminderState(setup.backupReminder) : undefined
  }, [setup])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!state?.due) return null

  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl bg-sun-300/50 p-4 ring-1 ring-sun-500 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-stone-900">
        <strong>Time for a backup?</strong> You've made {state.changes} change{state.changes === 1 ? '' : 's'}
        {state.lastBackupAt ? ` since your last backup` : ' and haven’t saved a backup yet'}. Browsers sometimes clear saved data, so a backup
        file keeps your stash safe.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await exportBackup()
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          Save backup
        </Button>
        <Button variant="ghost" onClick={() => snoozeReminder(3)}>
          Later
        </Button>
      </div>
      {error && <p className="text-sm text-red-800">{error}</p>}
    </div>
  )
}
