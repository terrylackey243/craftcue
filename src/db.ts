import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Person,
  Project,
  ShoppingCheck,
  Supply,
  UpcCacheEntry,
  UsageLogEntry,
  UserSetup,
} from './types'

export interface MetaEntry {
  key: string
  value: unknown
}

/** Secrets never go into backups. Only the Anthropic key lives here today. */
export interface SecretEntry {
  key: 'anthropicApiKey'
  value: string
}

export class CraftCueDB extends Dexie {
  supplies!: Table<Supply, string>
  categories!: Table<Category, string>
  setup!: Table<UserSetup, string>
  meta!: Table<MetaEntry, string>
  secrets!: Table<SecretEntry, string>
  upcCache!: Table<UpcCacheEntry, string>
  people!: Table<Person, string>
  projects!: Table<Project, string>
  usageLog!: Table<UsageLogEntry, number>
  shoppingChecks!: Table<ShoppingCheck, string>

  constructor(name = 'craftcue') {
    super(name)
    this.version(1).stores({
      supplies: 'id, category, name, location, upc, updatedAt',
      categories: 'id',
      setup: 'id',
      meta: 'key',
      secrets: 'key',
      upcCache: 'upc',
      people: 'id, name',
      projects: 'id, status, goal, personId, updatedAt',
      usageLog: '++id, timestamp, feature',
      shoppingChecks: 'key',
    })
  }
}

export const db = new CraftCueDB()

/** Tables that are part of a backup, in restore order. */
export const BACKUP_TABLES = [
  'supplies',
  'categories',
  'setup',
  'upcCache',
  'people',
  'projects',
  'usageLog',
  'shoppingChecks',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

// ----- meta helpers -----

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/**
 * Count a user-visible change toward the backup reminder (spec 3.3). Called by every repository
 * write in src/lib/repo.ts rather than by Dexie hooks, so imports and resets don't inflate it.
 */
export async function noteChange(n = 1): Promise<void> {
  const current = await getMeta<number>('changesSinceBackup', 0)
  await setMeta('changesSinceBackup', current + n)
}
