import type { PushChange, RemoteRow, SyncServer } from '../../src/lib/cloud/server'

/** In-memory stand-in for the Supabase side, mirroring sync_push's rules (see the SQL migration). */
export class FakeServer implements SyncServer {
  rows = new Map<string, RemoteRow & { user: string }>()
  photos = new Map<string, Blob>()
  private version = 0
  now = () => Date.now()
  offline = false
  uid: string | null = 'user-1'

  private check() {
    if (this.offline) throw new TypeError('Failed to fetch')
  }

  async userId() {
    return this.uid
  }

  async push(changes: PushChange[]) {
    this.check()
    let applied = 0
    let skipped = 0
    for (const c of changes) {
      const key = `${this.uid}|${c.collection}|${c.id}`
      const edit = Math.min(Date.parse(c.updatedAt), this.now())
      const existing = this.rows.get(key)
      if (existing && Date.parse(existing.client_updated_at) > edit) {
        skipped++
        continue
      }
      this.rows.set(key, {
        user: this.uid!,
        collection: c.collection,
        id: c.id,
        data: c.deleted ? null : (JSON.parse(JSON.stringify(c.data)) as Record<string, unknown>),
        deleted: c.deleted,
        version: ++this.version,
        client_updated_at: new Date(edit).toISOString(),
      })
      applied++
    }
    return { applied, skipped }
  }

  async pull(since: number, limit: number) {
    this.check()
    return [...this.rows.values()]
      .filter((r) => r.user === this.uid && r.version > since)
      .sort((a, b) => a.version - b.version)
      .slice(0, limit)
      .map(({ user: _u, ...r }) => JSON.parse(JSON.stringify(r)) as RemoteRow)
  }

  async uploadPhoto(path: string, blob: Blob) {
    this.check()
    this.photos.set(path, blob)
  }

  async downloadPhoto(path: string) {
    this.check()
    const b = this.photos.get(path)
    if (!b) throw new Error('not found')
    return b
  }

  async deleteAllPhotos() {
    for (const k of [...this.photos.keys()]) if (k.startsWith(`${this.uid}/`)) this.photos.delete(k)
  }
}
