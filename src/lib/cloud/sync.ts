// Offline-first sync: the device's IndexedDB is the working copy; changes are pushed from the
// outbox and pulled by version. Last edit wins, by when the edit was made on the device.
import type { CraftCueDB, OutboxEntry, SyncedCollection } from '../../db'
import { SYNCED_COLLECTIONS, markRemote, outboxKey } from '../../db'
import type { PushChange, RemoteRow, SyncServer } from './server'

const PUSH_BATCH = 200
const PULL_BATCH = 500

/** Fields that hold a photo (data URL) locally and a storage path on the server. */
const PHOTO_FIELDS: Partial<Record<SyncedCollection, string>> = { supplies: 'thumbnail', projects: 'photoThumb' }
const pathField = (field: string) => `${field}Path`

type Row = Record<string, unknown>

// ----- helpers -----

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
  }
  // Insecure contexts have no SubtleCrypto; a 64-bit FNV-1a is plenty to detect a changed photo.
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n)
  return h.toString(16).padStart(16, '0')
}

export async function photoPath(uid: string, collection: string, id: string, dataUrl: string): Promise<string> {
  return `${uid}/${collection}/${encodeURIComponent(id)}/${await sha256Hex(dataUrl)}.jpg`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`
}

// ----- engine -----

export interface SyncResult {
  pushed: number
  pulled: number
}

export class SyncEngine {
  private db: CraftCueDB
  private server: SyncServer
  private running: Promise<SyncResult> | null = null

  constructor(db: CraftCueDB, server: SyncServer) {
    this.db = db
    this.server = server
  }

  /** One full round: push local changes, then pull everything newer. Calls are coalesced. */
  sync(): Promise<SyncResult> {
    if (!this.running) {
      this.running = (async () => {
        try {
          const uid = await this.server.userId()
          if (!uid) throw new Error('not signed in')
          const pushed = await this.push(uid)
          const pulled = await this.pull()
          await this.db.meta.put({ key: 'lastSyncedAt', value: new Date().toISOString() })
          return { pushed, pulled }
        } finally {
          this.running = null
        }
      })()
    }
    return this.running
  }

  async pendingCount(): Promise<number> {
    return this.db.outbox.count()
  }

  // --- push ---

  private async push(uid: string): Promise<number> {
    let total = 0
    for (;;) {
      const entries = await this.db.outbox.orderBy('queuedAt').limit(PUSH_BATCH).toArray()
      if (!entries.length) return total
      const changes: PushChange[] = []
      for (const e of entries) changes.push(await this.toChange(uid, e))
      await this.server.push(changes)
      // Only clear entries that weren't edited again while we were pushing.
      await this.db.transaction('rw', this.db.outbox, async () => {
        for (const e of entries) {
          const current = await this.db.outbox.get(e.key)
          if (current && current.queuedAt === e.queuedAt) await this.db.outbox.delete(e.key)
        }
      })
      total += entries.length
      if (entries.length < PUSH_BATCH) return total
    }
  }

  private async toChange(uid: string, e: OutboxEntry): Promise<PushChange> {
    const updatedAt = new Date(e.queuedAt).toISOString()
    const record = (await this.db.table(e.collection).get(e.id)) as Row | undefined
    if (!record) return { collection: e.collection, id: e.id, data: null, deleted: true, updatedAt }
    const data: Row = { ...record }
    const field = PHOTO_FIELDS[e.collection]
    if (field) {
      const dataUrl = data[field]
      delete data[field]
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        const path = await photoPath(uid, e.collection, e.id, dataUrl)
        const doneKey = `uploaded:${path}`
        if (!(await this.db.meta.get(doneKey))) {
          await this.server.uploadPhoto(path, dataUrlToBlob(dataUrl))
          await this.db.meta.put({ key: doneKey, value: true })
        }
        data[pathField(field)] = path
      } else {
        delete data[pathField(field)]
      }
    }
    return { collection: e.collection, id: e.id, data, deleted: false, updatedAt }
  }

  // --- pull ---

  private async pull(): Promise<number> {
    let total = 0
    let cursor = ((await this.db.meta.get('syncCursor'))?.value as number) ?? 0
    for (;;) {
      const rows = await this.server.pull(cursor, PULL_BATCH)
      if (!rows.length) return total
      const photos = await this.apply(rows)
      cursor = rows[rows.length - 1].version
      await this.db.meta.put({ key: 'syncCursor', value: cursor })
      await this.fetchPhotos(photos)
      total += rows.length
      if (rows.length < PULL_BATCH) return total
    }
  }

  /** Apply pulled rows. Returns photos that need downloading. */
  private async apply(rows: RemoteRow[]): Promise<{ collection: SyncedCollection; id: string; field: string; path: string }[]> {
    const wanted: { collection: SyncedCollection; id: string; field: string; path: string }[] = []
    const tables = SYNCED_COLLECTIONS.map((c) => this.db.table(c))
    // Hash the photos we already have *before* opening the transaction: IndexedDB commits a
    // transaction as soon as it awaits anything that isn't a database call (like SubtleCrypto).
    const localPhotoHash = new Map<string, string>()
    for (const row of rows) {
      const field = PHOTO_FIELDS[row.collection]
      if (!field || row.deleted || !row.data || typeof row.data[pathField(field)] !== 'string') continue
      const existing = (await this.db.table(row.collection).get(row.id)) as Row | undefined
      const photo = existing?.[field]
      if (typeof photo === 'string') localPhotoHash.set(`${row.collection}|${row.id}`, await sha256Hex(photo))
    }
    await this.db.transaction('rw', [...tables, this.db.outbox], async (tx) => {
      markRemote(tx)
      for (const row of rows) {
        if (!SYNCED_COLLECTIONS.includes(row.collection)) continue
        const table = this.db.table(row.collection)
        // An unpushed local edit that is newer than this row wins; it will be pushed next.
        const pending = await this.db.outbox.get(outboxKey(row.collection, row.id))
        if (pending) {
          if (pending.queuedAt >= Date.parse(row.client_updated_at)) continue
          await this.db.outbox.delete(pending.key)
        }
        if (row.deleted || !row.data) {
          await table.delete(row.id)
          continue
        }
        const data: Row = { ...row.data }
        const field = PHOTO_FIELDS[row.collection]
        if (field) {
          const path = data[pathField(field)]
          if (typeof path === 'string') {
            const existing = (await table.get(row.id)) as Row | undefined
            const localPhoto = existing?.[field]
            const hash = localPhotoHash.get(`${row.collection}|${row.id}`)
            const same = typeof localPhoto === 'string' && hash !== undefined && path.endsWith(`/${hash}.jpg`)
            if (same) data[field] = localPhoto
            else wanted.push({ collection: row.collection, id: row.id, field, path })
          }
        }
        await table.put(data)
      }
    })
    return wanted
  }

  private async fetchPhotos(list: { collection: SyncedCollection; id: string; field: string; path: string }[]) {
    for (const p of list) {
      let dataUrl: string
      try {
        dataUrl = await blobToDataUrl(await this.server.downloadPhoto(p.path))
      } catch {
        continue // try again on a later full sync; the record keeps its path
      }
      await this.db.transaction('rw', this.db.table(p.collection), async (tx) => {
        markRemote(tx)
        const current = (await this.db.table(p.collection).get(p.id)) as Row | undefined
        if (current && current[pathField(p.field)] === p.path) {
          await this.db.table(p.collection).put({ ...current, [p.field]: dataUrl })
        }
      })
      await this.db.meta.put({ key: `uploaded:${p.path}`, value: true })
    }
  }

  // --- account lifecycle ---

  /**
   * First sign-in on this device: queue everything already here so it reaches the account.
   * Each record keeps its own edit time, so newer copies already on the server still win.
   */
  async adoptLocalData(): Promise<number> {
    let n = 0
    await this.db.transaction('rw', [...SYNCED_COLLECTIONS.map((c) => this.db.table(c)), this.db.outbox], async (tx) => {
      markRemote(tx)
      for (const collection of SYNCED_COLLECTIONS) {
        const table = this.db.table(collection)
        const key = table.schema.primKey.keyPath as string
        const rows = (await table.toArray()) as Row[]
        for (const r of rows) {
          const edited = Date.parse(String(r.updatedAt ?? r.confirmedAt ?? r.checkedAt ?? r.timestamp ?? ''))
          const id = String(r[key])
          const existing = await this.db.outbox.get(outboxKey(collection, id))
          await this.db.outbox.put({ key: outboxKey(collection, id), collection, id, queuedAt: Math.max(existing?.queuedAt ?? 0, Number.isFinite(edited) ? edited : 0) })
          n++
        }
      }
    })
    return n
  }

  /** Forget everything synced from the account (sign-out or account deletion). */
  async clearLocal(): Promise<void> {
    await this.db.transaction('rw', [...SYNCED_COLLECTIONS.map((c) => this.db.table(c)), this.db.outbox, this.db.meta], async (tx) => {
      markRemote(tx)
      for (const c of SYNCED_COLLECTIONS) await this.db.table(c).clear()
      await this.db.outbox.clear()
      const metaKeys = (await this.db.meta.toCollection().primaryKeys()) as string[]
      await this.db.meta.bulkDelete(metaKeys.filter((k) => k.startsWith('uploaded:') || ['syncCursor', 'lastSyncedAt', 'syncUserId', 'changesSinceBackup'].includes(k)))
    })
  }
}
