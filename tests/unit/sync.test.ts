import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CraftCueDB, markRemote, outboxKey } from '../../src/db'
import { SyncEngine } from '../../src/lib/cloud/sync'
import type { Supply } from '../../src/types'
import { FakeServer } from './fakeServer'

// Two "devices" = two separate IndexedDB databases sharing one account on a fake server.

let n = 0
let server: FakeServer
let a: CraftCueDB
let b: CraftCueDB
let syncA: SyncEngine
let syncB: SyncEngine

const supply = (id: string, over: Partial<Supply> = {}): Supply => ({
  id,
  name: `Supply ${id}`,
  category: 'felt',
  quantity: 5,
  unit: 'sheet',
  source: 'manual',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
  ...over,
})

const tick = () => new Promise((r) => setTimeout(r, 5))

beforeEach(async () => {
  n++
  server = new FakeServer()
  a = new CraftCueDB(`device-a-${n}`)
  b = new CraftCueDB(`device-b-${n}`)
  await a.open()
  await b.open()
  syncA = new SyncEngine(a, server)
  syncB = new SyncEngine(b, server)
})

afterEach(async () => {
  await a.delete()
  await b.delete()
})

describe('outbox', () => {
  it('records puts, modifies, deletes and clears on synced tables', async () => {
    await a.supplies.put(supply('s1'))
    await a.supplies.where('id').equals('s1').modify({ quantity: 2 })
    await a.people.put({ id: 'p1', name: 'Ann', interests: [], pastGiftProjectIds: [], createdAt: '', updatedAt: '' })
    await a.people.clear()
    const keys = (await a.outbox.toArray()).map((e) => e.key).sort()
    expect(keys).toEqual([outboxKey('people', 'p1'), outboxKey('supplies', 's1')])
  })

  it('ignores device-only tables and changes applied from the server', async () => {
    await a.meta.put({ key: 'x', value: 1 })
    await a.secrets.put({ key: 'anthropicApiKey', value: 'k' })
    await a.transaction('rw', a.supplies, async (tx) => {
      markRemote(tx)
      await a.supplies.put(supply('remote'))
    })
    expect(await a.outbox.count()).toBe(0)
  })

  it('a failed transaction leaves no outbox entry', async () => {
    await expect(
      a.transaction('rw', a.supplies, async () => {
        await a.supplies.put(supply('s1'))
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await a.outbox.count()).toBe(0)
    expect(await a.supplies.count()).toBe(0)
  })
})

describe('two devices, one account', () => {
  it('a new supply on one device appears on the other', async () => {
    await a.supplies.put(supply('s1', { name: 'Black vinyl' }))
    await syncA.sync()
    expect(await a.outbox.count()).toBe(0)
    await syncB.sync()
    expect((await b.supplies.get('s1'))?.name).toBe('Black vinyl')
    // Applying pulled rows must not queue them to be pushed back.
    expect(await b.outbox.count()).toBe(0)
  })

  it('deletions reach the other device', async () => {
    await a.supplies.put(supply('s1'))
    await syncA.sync()
    await syncB.sync()
    await b.supplies.delete('s1')
    await syncB.sync()
    await syncA.sync()
    expect(await a.supplies.get('s1')).toBeUndefined()
  })

  it('the later edit wins, even if it reaches the server first', async () => {
    await a.supplies.put(supply('s1', { quantity: 5 }))
    await syncA.sync()
    await syncB.sync()
    // A edits first but stays offline; B edits later and syncs; then A comes online.
    server.offline = true
    await a.supplies.update('s1', { quantity: 1 })
    await tick()
    server.offline = false
    await b.supplies.update('s1', { quantity: 9 })
    await syncB.sync()
    await syncA.sync()
    await syncB.sync()
    expect((await a.supplies.get('s1'))?.quantity).toBe(9)
    expect((await b.supplies.get('s1'))?.quantity).toBe(9)
  })

  it('an offline device keeps its newer edit and pushes it when back online', async () => {
    await a.supplies.put(supply('s1', { quantity: 5 }))
    await syncA.sync()
    await syncB.sync()
    await b.supplies.update('s1', { quantity: 3 })
    await syncB.sync()
    await tick()
    await a.supplies.update('s1', { quantity: 7 }) // newer, not yet pushed
    server.offline = true
    await expect(syncA.sync()).rejects.toThrow()
    server.offline = false
    await syncA.sync()
    await syncB.sync()
    expect((await a.supplies.get('s1'))?.quantity).toBe(7)
    expect((await b.supplies.get('s1'))?.quantity).toBe(7)
  })

  it('an edit made while a push is in flight is not lost', async () => {
    await a.supplies.put(supply('s1', { quantity: 1 }))
    const realPush = server.push.bind(server)
    server.push = async (changes) => {
      await a.supplies.update('s1', { quantity: 2 }) // user taps + mid-sync
      await tick()
      return realPush(changes)
    }
    await syncA.sync()
    server.push = realPush
    expect(await a.outbox.count()).toBe(1)
    await syncA.sync()
    await syncB.sync()
    expect((await b.supplies.get('s1'))?.quantity).toBe(2)
  })

  it('photos travel as files, not inside the record', async () => {
    const photo = 'data:image/jpeg;base64,' + btoa('fake-jpeg-bytes')
    await a.supplies.put(supply('s1', { thumbnail: photo }))
    await syncA.sync()
    const row = [...server.rows.values()][0]
    expect(row.data?.thumbnail).toBeUndefined()
    expect(String(row.data?.thumbnailPath)).toMatch(/^user-1\/supplies\/s1\/[0-9a-f]+\.jpg$/)
    expect(server.photos.size).toBe(1)
    await syncB.sync()
    expect((await b.supplies.get('s1'))?.thumbnail).toBe(photo)
    // Re-pulling our own change keeps the local photo without downloading it again.
    await syncA.sync()
    expect((await a.supplies.get('s1'))?.thumbnail).toBe(photo)
  })

  it('first sign-in uploads data made before signing in, without overwriting newer server copies', async () => {
    // Device B has an old copy of s1 and its own s2, from before accounts existed.
    await b.transaction('rw', b.supplies, async (tx) => {
      markRemote(tx) // simulate pre-sync data with no outbox entries
      await b.supplies.put(supply('s1', { name: 'old name', updatedAt: '2026-01-01T00:00:00.000Z' }))
      await b.supplies.put(supply('s2', { updatedAt: '2026-02-01T00:00:00.000Z' }))
    })
    await a.supplies.put(supply('s1', { name: 'new name' }))
    await syncA.sync()
    expect(await syncB.adoptLocalData()).toBe(2)
    await syncB.sync()
    await syncA.sync()
    expect((await b.supplies.get('s1'))?.name).toBe('new name')
    expect(await a.supplies.get('s2')).toBeTruthy()
  })

  it('a brand-new device downloads the whole stash', async () => {
    for (let i = 0; i < 1200; i++) await a.supplies.put(supply(`s${i}`))
    await syncA.sync()
    await syncB.sync()
    expect(await b.supplies.count()).toBe(1200)
  })

  it('signing out clears synced data but keeps the device API key', async () => {
    await a.supplies.put(supply('s1'))
    await a.secrets.put({ key: 'anthropicApiKey', value: 'k' })
    await syncA.sync()
    await syncA.clearLocal()
    expect(await a.supplies.count()).toBe(0)
    expect(await a.outbox.count()).toBe(0)
    expect(await a.secrets.count()).toBe(1)
  })

  it('another user never receives this account’s data', async () => {
    await a.supplies.put(supply('s1'))
    await syncA.sync()
    server.uid = 'user-2'
    await syncB.sync()
    expect(await b.supplies.count()).toBe(0)
  })
})
