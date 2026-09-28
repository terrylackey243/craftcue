// The sync engine talks to the server only through this interface, so it can be tested against
// an in-memory fake and a real (local) Supabase with the same code.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncedCollection } from '../../db'

export interface PushChange {
  collection: SyncedCollection
  id: string
  data: unknown
  deleted: boolean
  /** When the edit was made on the device (ISO). Last edit wins. */
  updatedAt: string
}

export interface RemoteRow {
  collection: SyncedCollection
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  version: number
  client_updated_at: string
}

export interface SyncServer {
  userId(): Promise<string | null>
  push(changes: PushChange[]): Promise<{ applied: number; skipped: number }>
  pull(sinceVersion: number, limit: number): Promise<RemoteRow[]>
  uploadPhoto(path: string, blob: Blob): Promise<void>
  downloadPhoto(path: string): Promise<Blob>
  deleteAllPhotos(): Promise<void>
}

export class SupabaseServer implements SyncServer {
  private client: SupabaseClient
  constructor(client: SupabaseClient) {
    this.client = client
  }

  async userId() {
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  async push(changes: PushChange[]) {
    const { data, error } = await this.client.rpc('sync_push', { changes })
    if (error) throw error
    return data as { applied: number; skipped: number }
  }

  async pull(sinceVersion: number, limit: number) {
    const { data, error } = await this.client
      .from('records')
      .select('collection,id,data,deleted,version,client_updated_at')
      .gt('version', sinceVersion)
      .order('version', { ascending: true })
      .limit(limit)
    if (error) throw error
    return data as RemoteRow[]
  }

  async uploadPhoto(path: string, blob: Blob) {
    const { error } = await this.client.storage.from('photos').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
    if (error) throw error
  }

  async downloadPhoto(path: string) {
    const { data, error } = await this.client.storage.from('photos').download(path)
    if (error) throw error
    return data
  }

  async deleteAllPhotos() {
    const uid = await this.userId()
    if (!uid) return
    const bucket = this.client.storage.from('photos')
    // Layout: <uid>/<collection>/<record id>/<hash>.jpg
    const paths: string[] = []
    const walk = async (prefix: string, depth: number) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(prefix, { limit: 1000, offset })
        if (error) throw error
        for (const item of data) {
          const full = `${prefix}/${item.name}`
          if (item.id === null && depth < 3) await walk(full, depth + 1)
          else if (item.id !== null) paths.push(full)
        }
        if (data.length < 1000) break
      }
    }
    await walk(uid, 1)
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100))
      if (error) throw error
    }
  }
}
