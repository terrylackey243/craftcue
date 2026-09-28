// @vitest-environment node
// The real sync engine, two "devices" (separate IndexedDB databases) and a real local Supabase.
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { CraftCueDB } from '../../src/db'
import { SupabaseServer } from '../../src/lib/cloud/server'
import { SyncEngine } from '../../src/lib/cloud/sync'
import type { Supply } from '../../src/types'

const URL = process.env.SB_URL!
const ANON = process.env.SB_PUBLISHABLE_KEY!
const SECRET = process.env.SB_SECRET_KEY!
const email = `sync-${Date.now()}@craftcue.test`
let userId = ''

async function device(name: string) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (error) throw error
  userId = data.user.id
  const db = new CraftCueDB(`e2e-${name}-${Date.now()}`)
  await db.open()
  return { db, engine: new SyncEngine(db, new SupabaseServer(sb)), server: new SupabaseServer(sb) }
}

const supply = (id: string, over: Partial<Supply> = {}): Supply => ({
  id,
  name: `Supply ${id}`,
  category: 'felt',
  quantity: 3,
  unit: 'sheet',
  source: 'manual',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
  ...over,
})

afterAll(async () => {
  if (userId) await createClient(URL, SECRET).auth.admin.deleteUser(userId)
})

describe('end-to-end sync with Supabase', () => {
  it('creates, edits, deletes and photos flow between two devices', async () => {
    await createClient(URL, SECRET).auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true })
    const mac = await device('mac')
    const ipad = await device('ipad')

    const photo = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')
    await mac.db.supplies.bulkPut([supply('s1', { name: 'Black vinyl', thumbnail: photo }), supply('s2')])
    await mac.db.setup.put({ id: 'setup', machineId: 'cricut-maker-5', setupComplete: true } as never)
    await mac.engine.sync()

    await ipad.engine.sync()
    expect(await ipad.db.supplies.count()).toBe(2)
    expect((await ipad.db.supplies.get('s1'))?.thumbnail).toBe(photo)
    expect((await ipad.db.setup.get('setup'))?.setupComplete).toBe(true)

    await ipad.db.supplies.update('s1', { quantity: 1, updatedAt: new Date().toISOString() })
    await ipad.db.supplies.delete('s2')
    await ipad.engine.sync()
    await mac.engine.sync()
    expect((await mac.db.supplies.get('s1'))?.quantity).toBe(1)
    expect(await mac.db.supplies.get('s2')).toBeUndefined()
    expect(await mac.db.outbox.count()).toBe(0)

    // Deleting the account's photos leaves nothing behind in storage.
    await mac.server.deleteAllPhotos()
    const left = await createClient(URL, SECRET).storage.from('photos').list(`${userId}/supplies/s1`)
    expect(left.data ?? []).toEqual([])
  })
})
