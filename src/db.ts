import Dexie, { type DBCore, type DBCoreMutateRequest, type Table } from 'dexie'
import type {
  Artwork,
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

/** Secrets never go into backups or sync: the user's own API keys, kept on this device only. */
export type SecretKey = 'anthropicApiKey' | 'openaiApiKey' | 'recraftApiKey'
export interface SecretEntry {
  key: SecretKey
  value: string
}

/** One pending local change waiting to be pushed to the account. */
export interface OutboxEntry {
  key: string // `${collection}\u0000${id}`
  collection: SyncedCollection
  id: string
  queuedAt: number
  /** Unique per change. Two edits in the same millisecond still differ, so none is lost. */
  rev?: string
}

/** Tables that sync to the user's account (and go into backups). Order = restore order. */
export const SYNCED_COLLECTIONS = ['setup', 'categories', 'supplies', 'people', 'projects', 'upcCache', 'shoppingChecks', 'usage', 'artwork'] as const
export type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number]
const SYNCED = new Set<string>(SYNCED_COLLECTIONS)

export class CraftCueDB extends Dexie {
  supplies!: Table<Supply, string>
  categories!: Table<Category, string>
  setup!: Table<UserSetup, string>
  meta!: Table<MetaEntry, string>
  secrets!: Table<SecretEntry, string>
  upcCache!: Table<UpcCacheEntry, string>
  people!: Table<Person, string>
  projects!: Table<Project, string>
  usage!: Table<UsageLogEntry, string>
  shoppingChecks!: Table<ShoppingCheck, string>
  outbox!: Table<OutboxEntry, string>
  artwork!: Table<Artwork, string>

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
    // v2 (sync): usage entries need globally unique ids, so they move from the auto-increment
    // `usageLog` table to `usage` keyed by UUID; `outbox` tracks changes to push.
    this.version(2)
      .stores({
        usageLog: null,
        usage: 'id, timestamp, feature',
        outbox: 'key, queuedAt',
      })
      .upgrade(async (tx) => {
        const old = await tx.table('usageLog').toArray()
        await tx.table('usage').bulkAdd(old.map(({ id: _id, ...e }) => ({ ...e, id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` })))
      })
    // v3: artwork from the image add-ons.
    this.version(3).stores({ artwork: 'id, projectId, createdAt' })
    this.use(outboxMiddleware())
  }
}

/**
 * Pulled changes are applied inside transactions marked with this flag so they are not echoed
 * back to the server.
 */
const REMOTE_FLAG = '__craftcueRemote'

export function markRemote(tx: { idbtrans: IDBTransaction }): void {
  ;(tx.idbtrans as unknown as Record<string, boolean>)[REMOTE_FLAG] = true
}

export const outboxKey = (collection: string, id: string) => `${collection}\u0000${id}`

let revCounter = 0
const revPrefix = Math.random().toString(36).slice(2, 8)
/** A token that is different for every queued change, even within one millisecond. */
export const nextRev = () => `${revPrefix}-${Date.now()}-${++revCounter}`

/** Called after a local change is queued for sync (used to schedule a push). */
export const outboxListeners = new Set<() => void>()

/**
 * Records every change to a synced table in `outbox`, inside the same transaction, so a change
 * and its "needs pushing" note are saved together or not at all.
 */
function outboxMiddleware() {
  return {
    stack: 'dbcore' as const,
    name: 'craftcue-outbox',
    create(down: DBCore): DBCore {
      return {
        ...down,
        transaction(stores, mode, options) {
          const needsOutbox = mode === 'readwrite' && stores.some((s) => SYNCED.has(s)) && !stores.includes('outbox')
          return down.transaction(needsOutbox ? [...stores, 'outbox'] : stores, mode, options)
        },
        table(tableName) {
          const table = down.table(tableName)
          if (!SYNCED.has(tableName)) return table
          return {
            ...table,
            async mutate(req: DBCoreMutateRequest) {
              const remote = (req.trans as unknown as Record<string, boolean>)[REMOTE_FLAG]
              let keys: unknown[] = []
              if (!remote && req.type === 'deleteRange') {
                const found = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })
                keys = found.result
              }
              const res = await table.mutate(req)
              if (remote) return res
              if (req.type === 'add' || req.type === 'put') keys = res.results ?? req.keys ?? req.values.map((v) => table.schema.primaryKey.extractKey?.(v))
              else if (req.type === 'delete') keys = req.keys
              const now = Date.now()
              const values = keys
                .filter((k, i) => k !== undefined && !(res.failures && res.failures[i]))
                .map((k) => ({ key: outboxKey(tableName, String(k)), collection: tableName, id: String(k), queuedAt: now, rev: nextRev() }))
              if (values.length) {
                await down.table('outbox').mutate({ type: 'put', trans: req.trans, values })
                outboxListeners.forEach((l) => l())
              }
              return res
            },
          }
        },
      }
    },
  }
}

export const db = new CraftCueDB()

/** Tables that are part of a backup, in restore order. */
export const BACKUP_TABLES = SYNCED_COLLECTIONS
export type BackupTable = SyncedCollection

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
