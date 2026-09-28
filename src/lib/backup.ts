import { BACKUP_TABLES, db, getMeta, setMeta, type BackupTable } from '../db'
import { APP_VERSION, BACKUP_SCHEMA_VERSION } from '../config'
import { nowIso } from './ids'

export interface BackupFile {
  app: 'craftcue'
  schemaVersion: number
  appVersion: string
  exportedAt: string
  data: Partial<Record<BackupTable, unknown[]>>
}

export class BackupError extends Error {}

/**
 * Forward migrations, keyed by the version they upgrade FROM. Each takes a backup at version N and
 * returns it at version N+1. Add one whenever BACKUP_SCHEMA_VERSION goes up; never edit old ones.
 */
export const MIGRATIONS: Record<number, (b: BackupFile) => BackupFile> = {
  // 1: (b) => ({ ...b, schemaVersion: 2, data: { ...b.data, supplies: b.data.supplies?.map(...) } }),
}

export function migrate(backup: BackupFile, target = BACKUP_SCHEMA_VERSION, migrations = MIGRATIONS): BackupFile {
  let b = backup
  while (b.schemaVersion < target) {
    const step = migrations[b.schemaVersion]
    if (!step) throw new BackupError(`This backup is from an older version (${b.schemaVersion}) that can't be upgraded.`)
    b = step(b)
  }
  return b
}

export async function buildBackup(): Promise<BackupFile> {
  const data: BackupFile['data'] = {}
  for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray()
  return { app: 'craftcue', schemaVersion: BACKUP_SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: nowIso(), data }
}

export function backupFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `craftcue-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** Mark that a backup was just taken; resets the reminder. */
export async function markBackedUp(): Promise<void> {
  await setMeta('lastBackupAt', nowIso())
  await setMeta('changesSinceBackup', 0)
}

/** Save the backup file. Uses the share sheet on phones/tablets where downloads are awkward. */
export async function exportBackup(): Promise<'shared' | 'downloaded'> {
  const backup = await buildBackup()
  const json = JSON.stringify(backup)
  const name = backupFilename()
  const file = new File([json], name, { type: 'application/json' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches
  if (isTouch && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'CraftCue backup' })
      await markBackedUp()
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new BackupError('Backup was cancelled.')
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  await markBackedUp()
  return 'downloaded'
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a CraftCue backup (it couldn't be read).")
  }
  const b = raw as Partial<BackupFile>
  if (!b || b.app !== 'craftcue' || typeof b.schemaVersion !== 'number' || typeof b.data !== 'object') {
    throw new BackupError("That file isn't a CraftCue backup.")
  }
  if (b.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of CraftCue. Refresh the app to update it, then try again.')
  }
  return migrate(b as BackupFile)
}

export interface ImportResult {
  counts: Partial<Record<BackupTable, number>>
}

type Row = { id?: string; upc?: string; key?: string; updatedAt?: string }

/**
 * replace: wipe the backed-up tables and load the file.
 * merge: add records that aren't here, and for ones that are, keep whichever was edited last.
 * Your own settings (machine, tools) win over the file's in merge mode.
 */
export async function importBackup(backup: BackupFile, mode: 'replace' | 'merge'): Promise<ImportResult> {
  const counts: ImportResult['counts'] = {}
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = (backup.data[t] ?? []) as Row[]
      const table = db.table(t)
      if (mode === 'replace') {
        await table.clear()
        if (t === 'usageLog') await table.bulkAdd(rows)
        else await table.bulkPut(rows)
        counts[t] = rows.length
        continue
      }
      if (t === 'setup') {
        if ((await table.count()) === 0 && rows.length) await table.put(rows[0])
        continue
      }
      if (t === 'usageLog') {
        // Usage entries have auto ids; merge on timestamp+feature to avoid double counting.
        const existing = new Set((await table.toArray()).map((r: { timestamp: string; feature: string }) => `${r.timestamp}|${r.feature}`))
        const fresh = (rows as unknown as { id?: number; timestamp: string; feature: string }[])
          .filter((r) => !existing.has(`${r.timestamp}|${r.feature}`))
          .map(({ id: _id, ...r }) => r)
        await table.bulkAdd(fresh)
        counts[t] = fresh.length
        continue
      }
      let n = 0
      for (const row of rows) {
        const key = row.id ?? row.upc ?? row.key
        if (!key) continue
        const current = (await table.get(key)) as Row | undefined
        if (!current || (row.updatedAt && (!current.updatedAt || row.updatedAt > current.updatedAt))) {
          await table.put(row)
          n++
        }
      }
      counts[t] = n
    }
  })
  return { counts }
}

// ----- reminder -----

export interface ReminderState {
  due: boolean
  changes: number
  daysSince: number | null
  lastBackupAt: string | null
}

export async function reminderState(settings: { enabled: boolean; afterChanges: number; afterDays: number }, now = Date.now()): Promise<ReminderState> {
  const changes = await getMeta<number>('changesSinceBackup', 0)
  const lastBackupAt = await getMeta<string | null>('lastBackupAt', null)
  const snoozedUntil = await getMeta<string | null>('reminderSnoozedUntil', null)
  const firstUseAt = await getMeta<string | null>('firstUseAt', null)
  const since = lastBackupAt ?? firstUseAt
  const daysSince = since ? Math.floor((now - Date.parse(since)) / 86_400_000) : null
  const snoozed = snoozedUntil ? Date.parse(snoozedUntil) > now : false
  const due =
    settings.enabled &&
    !snoozed &&
    changes > 0 &&
    (changes >= settings.afterChanges || (daysSince !== null && daysSince >= settings.afterDays))
  return { due, changes, daysSince, lastBackupAt }
}

export async function snoozeReminder(days = 3): Promise<void> {
  await setMeta('reminderSnoozedUntil', new Date(Date.now() + days * 86_400_000).toISOString())
}
