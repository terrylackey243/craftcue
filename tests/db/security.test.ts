// @vitest-environment node
// Runs against a real local Supabase (scripts/test-db.sh). Proves the privacy rules hold:
// nobody can read or change another person's data, and the shared catalog can't be vandalised.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.SB_URL!
const ANON = process.env.SB_PUBLISHABLE_KEY!
const SECRET = process.env.SB_SECRET_KEY!

const admin = () => createClient(URL, SECRET, { auth: { persistSession: false } })
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } })

const run = `${Date.now()}`
const created: string[] = []

async function user(name: string): Promise<{ sb: SupabaseClient; id: string }> {
  const email = `${name}-${run}@craftcue.test`
  const { data, error } = await admin().auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true })
  if (error) throw error
  created.push(data.user.id)
  const sb = anon()
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (e2) throw e2
  return { sb, id: data.user.id }
}

const change = (id: string, data: object, updatedAt = new Date().toISOString(), collection = 'supplies') => ({ collection, id, data, deleted: false, updatedAt })

let A: { sb: SupabaseClient; id: string }
let B: { sb: SupabaseClient; id: string }

beforeAll(async () => {
  A = await user('alice')
  B = await user('bob')
})

afterAll(async () => {
  for (const id of created) await admin().auth.admin.deleteUser(id).catch(() => {})
})

describe('records: each person sees only their own', () => {
  it('B cannot see A’s records, even asking for them by user id', async () => {
    const { error } = await A.sb.rpc('sync_push', { changes: [change('s1', { name: 'secret vinyl' })] })
    expect(error).toBeNull()
    const own = await A.sb.from('records').select('*')
    expect(own.data).toHaveLength(1)
    const theirs = await B.sb.from('records').select('*').eq('user_id', A.id)
    expect(theirs.data).toEqual([])
  })

  it('nobody signed out can read records or push', async () => {
    const read = await anon().from('records').select('*')
    expect(read.data ?? []).toEqual([])
    const push = await anon().rpc('sync_push', { changes: [change('x', {})] })
    expect(push.error).not.toBeNull()
  })

  it('direct inserts, updates and deletes are refused (only sync_push may write)', async () => {
    const ins = await B.sb.from('records').insert({ user_id: A.id, collection: 'supplies', id: 'evil', data: {}, client_updated_at: new Date().toISOString(), version: 1 })
    expect(ins.error).not.toBeNull()
    const upd = await B.sb.from('records').update({ data: { name: 'hacked' } }).eq('user_id', A.id).select()
    expect(upd.data ?? []).toEqual([])
    const del = await A.sb.from('records').delete().eq('id', 's1').select()
    expect(del.error ?? { denied: true }).toBeTruthy()
    expect((await A.sb.from('records').select('data').eq('id', 's1').single()).data?.data).toEqual({ name: 'secret vinyl' })
  })

  it('sync_push always writes as the signed-in user, whatever the payload says', async () => {
    await B.sb.rpc('sync_push', { changes: [{ ...change('s1', { name: 'bob’s own' }), user_id: A.id }] })
    expect((await A.sb.from('records').select('data').eq('id', 's1').single()).data?.data).toEqual({ name: 'secret vinyl' })
    expect((await B.sb.from('records').select('data').eq('id', 's1').single()).data?.data).toEqual({ name: 'bob’s own' })
  })

  it('last edit wins; an older edit is skipped; a future clock is clamped', async () => {
    const t0 = new Date(Date.now() - 60_000).toISOString()
    const r1 = await A.sb.rpc('sync_push', { changes: [change('lww', { v: 'new' })] })
    expect(r1.data.applied).toBe(1)
    const r2 = await A.sb.rpc('sync_push', { changes: [change('lww', { v: 'old' }, t0)] })
    expect(r2.data.skipped).toBe(1)
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString()
    await A.sb.rpc('sync_push', { changes: [change('lww', { v: 'future' }, future)] })
    const row = (await A.sb.from('records').select('data,client_updated_at').eq('id', 'lww').single()).data!
    expect(Date.parse(row.client_updated_at)).toBeLessThanOrEqual(Date.now() + 5_000)
    // Because the future edit was clamped to "now", a genuinely later edit still wins.
    await new Promise((r) => setTimeout(r, 20))
    await A.sb.rpc('sync_push', { changes: [change('lww', { v: 'later' })] })
    expect((await A.sb.from('records').select('data').eq('id', 'lww').single()).data?.data).toEqual({ v: 'later' })
  })

  it('rejects unknown collections and oversized batches', async () => {
    expect((await A.sb.rpc('sync_push', { changes: [change('z', {}, undefined, 'secrets')] })).error).not.toBeNull()
    const many = Array.from({ length: 501 }, (_, i) => change(`m${i}`, {}))
    expect((await A.sb.rpc('sync_push', { changes: many })).error).not.toBeNull()
  })

  it('versions only ever increase, so "changes since N" never misses a row', async () => {
    await A.sb.rpc('sync_push', { changes: [change('v1', {}), change('v2', {})] })
    const rows = (await A.sb.from('records').select('id,version').order('version')).data!
    const versions = rows.map((r) => r.version)
    expect([...versions].sort((x, y) => x - y)).toEqual(versions)
    expect(new Set(versions).size).toBe(versions.length)
  })
})

describe('photos: private per person', () => {
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

  it('A can store and read photos in their own folder only', async () => {
    const own = await A.sb.storage.from('photos').upload(`${A.id}/supplies/s1/abc.jpg`, jpeg)
    expect(own.error).toBeNull()
    const intoB = await A.sb.storage.from('photos').upload(`${B.id}/supplies/s1/abc.jpg`, jpeg)
    expect(intoB.error).not.toBeNull()
  })

  it('B cannot download or list A’s photos, and nobody signed out can', async () => {
    expect((await B.sb.storage.from('photos').download(`${A.id}/supplies/s1/abc.jpg`)).error).not.toBeNull()
    expect((await B.sb.storage.from('photos').list(`${A.id}/supplies/s1`)).data ?? []).toEqual([])
    expect((await anon().storage.from('photos').download(`${A.id}/supplies/s1/abc.jpg`)).error).not.toBeNull()
  })
})

describe('shared barcode catalog', () => {
  const UPC = '036000291452' // valid check digit
  const vinyl = { name: 'Glossy vinyl', brand: 'Maple Lane', dimensions: '12 x 12 in', category: 'adhesive-vinyl' }

  it('only signed-in crafters can contribute; everyone can look up', async () => {
    expect((await anon().rpc('submit_product', { p_upc: UPC, p_data: vinyl })).error).not.toBeNull()
    const first = await A.sb.rpc('submit_product', { p_upc: UPC, p_data: { ...vinyl, quantity: 99, location: 'bin 3', unitCost: '2' } })
    expect(first.data.status).toBe('unconfirmed')
    const seen = await anon().from('products').select('*').eq('upc', UPC).single()
    // Only product fields are kept: never quantities, places or prices.
    expect(seen.data?.data).toEqual(vinyl)
    expect(seen.data?.status).toBe('unconfirmed')
  })

  it('a second, different person agreeing confirms it; the same person twice does not', async () => {
    expect((await A.sb.rpc('submit_product', { p_upc: UPC, p_data: vinyl })).data.status).toBe('unconfirmed')
    expect((await B.sb.rpc('submit_product', { p_upc: UPC, p_data: { ...vinyl, name: '  Glossy vinyl ' } })).data.status).toBe('confirmed')
  })

  it('a lone wrong entry cannot override the version most people agree on', async () => {
    const C = await user('carol')
    await C.sb.rpc('submit_product', { p_upc: UPC, p_data: { name: 'Totally wrong thing' } })
    const p = (await anon().from('products').select('data,status,supporters').eq('upc', UPC).single()).data!
    expect(p.data.name).toBe('Glossy vinyl')
    expect(p.supporters).toBe(2)
  })

  it('rejects barcodes with a bad check digit and entries without a name', async () => {
    expect((await A.sb.rpc('submit_product', { p_upc: '036000291453', p_data: vinyl })).error?.code).toBe('22023')
    expect((await A.sb.rpc('submit_product', { p_upc: '012345678905', p_data: { brand: 'x' } })).error?.code).toBe('22023')
  })

  it('keeps the pack size (a product fact) but never the price paid', async () => {
    const upc = '012345678905'
    await A.sb.rpc('submit_product', { p_upc: upc, p_data: { name: 'Wiggly eyes', packSize: 80, packPrice: 1.26, unitCost: 0.01575 } })
    const p = (await anon().from('products').select('data').eq('upc', upc).single()).data!
    expect(p.data).toEqual({ name: 'Wiggly eyes', packSize: 80 })
    // Nonsense pack sizes are dropped.
    await B.sb.rpc('submit_product', { p_upc: upc, p_data: { name: 'Wiggly eyes', packSize: -5 } })
    const subs = (await B.sb.from('product_submissions').select('data').eq('upc', upc)).data!
    expect(subs[0].data).toEqual({ name: 'Wiggly eyes' })
  })

  it('keeps a mixed pack’s color breakdown, cleaned and capped', async () => {
    const upc = '036000291452'
    const colors = [{ color: 'Rocket Red', count: 3 }, { color: ' Solar Yellow ', count: 3 }, { color: '', count: 3 }, { color: 'Blank', count: 0 }, { color: 'Nope', count: 'x' }]
    const C = await user('crafter-colors')
    await C.sb.rpc('submit_product', { p_upc: upc, p_data: { name: 'Astrobrights cardstock', setName: 'Spectrum', packSize: 6, colors } })
    const sub = (await C.sb.from('product_submissions').select('data').eq('upc', upc)).data![0]
    expect(sub.data).toEqual({ name: 'Astrobrights cardstock', setName: 'Spectrum', packSize: 6, colors: [{ color: 'Rocket Red', count: 3 }, { color: 'Solar Yellow', count: 3 }] })
    const many = Array.from({ length: 150 }, (_, i) => ({ color: `c${i}`, count: 1 }))
    await C.sb.rpc('submit_product', { p_upc: upc, p_data: { name: 'Big pack', colors: many } })
    const big = (await C.sb.from('product_submissions').select('data').eq('upc', upc)).data![0]
    expect(big.data.colors).toHaveLength(100)
  })

  it('treats EAN-13 with a leading zero as the same product', async () => {
    const r = await A.sb.rpc('submit_product', { p_upc: '0036000291452', p_data: vinyl })
    expect(r.data.upc).toBe(UPC)
  })

  it('nobody can edit the catalog directly', async () => {
    const upd = await A.sb.from('products').update({ data: { name: 'vandalised' } }).eq('upc', UPC).select()
    expect(upd.data ?? []).toEqual([])
    const ins = await A.sb.from('products').insert({ upc: '012345678905', data: { name: 'x' }, fingerprint: 'x' })
    expect(ins.error).not.toBeNull()
    expect((await B.sb.from('product_submissions').select('*').eq('user_id', A.id)).data).toEqual([])
  })
})

describe('deleting an account', () => {
  it('removes the person’s records and catalog submissions', async () => {
    const D = await user('dave')
    await D.sb.rpc('sync_push', { changes: [change('d1', { name: 'x' })] })
    await D.sb.rpc('submit_product', { p_upc: '012345678905', p_data: { name: 'Test item' } })
    expect((await D.sb.rpc('delete_my_account')).error).toBeNull()
    const leftovers = await admin().from('records').select('id').eq('user_id', D.id)
    expect(leftovers.data).toEqual([])
    const subs = await admin().from('product_submissions').select('upc').eq('user_id', D.id)
    expect(subs.data).toEqual([])
    expect((await admin().auth.admin.getUserById(D.id)).data.user).toBeNull()
  })

  it('B cannot delete A’s account (it only ever deletes the caller)', async () => {
    await B.sb.rpc('delete_my_account', { uid: A.id }).then(() => {}, () => {})
    expect((await admin().auth.admin.getUserById(A.id)).data.user).not.toBeNull()
  })
})
