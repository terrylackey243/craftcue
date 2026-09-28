// Shared barcode catalog (see supabase/migrations/*_products.sql). Anyone can look a barcode
// up; signed-in crafters contribute the product description when they save a scanned item.
import { getMeta, setMeta } from '../../db'
import type { Supply } from '../../types'
import { accountStore, getSupabase } from './account'
import { cloudEnabled } from './config'

export interface SharedProduct {
  supply: Partial<Supply>
  status: 'confirmed' | 'unconfirmed'
  supporters: number
}

/** The only fields ever shared: a product description, never quantities, costs, places or photos. */
export const SHARED_FIELDS = ['name', 'category', 'subtype', 'brand', 'color', 'finish', 'dimensions', 'unit', 'adhesive'] as const

export function productFields(s: Partial<Supply>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of SHARED_FIELDS) {
    const v = s[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return out
}

export async function lookupShared(upc: string): Promise<SharedProduct | undefined> {
  if (!cloudEnabled || (typeof navigator !== 'undefined' && navigator.onLine === false)) return undefined
  try {
    const sb = await getSupabase()
    const { data, error } = await sb.from('products').select('data,status,supporters').eq('upc', upc).maybeSingle()
    if (error || !data) return undefined
    return { supply: data.data as Partial<Supply>, status: data.status, supporters: data.supporters }
  } catch {
    return undefined
  }
}

interface Pending {
  upc: string
  fields: Record<string, string>
}

/** Share a confirmed product. Offline or failed attempts wait in a small queue. */
export async function contributeProduct(upc: string, s: Partial<Supply>): Promise<void> {
  if (!cloudEnabled || !accountStore.get().userId) return
  const fields = productFields(s)
  if (!fields.name) return
  if (!(await trySubmit({ upc, fields }))) {
    const queue = await getMeta<Pending[]>('productQueue', [])
    await setMeta('productQueue', [...queue.filter((p) => p.upc !== upc), { upc, fields }].slice(-200))
  }
}

export async function flushProductQueue(): Promise<void> {
  const queue = await getMeta<Pending[]>('productQueue', [])
  if (!queue.length) return
  const left: Pending[] = []
  for (const p of queue) if (!(await trySubmit(p))) left.push(p)
  await setMeta('productQueue', left)
}

async function trySubmit(p: Pending): Promise<boolean> {
  try {
    const sb = await getSupabase()
    const { error } = await sb.rpc('submit_product', { p_upc: p.upc, p_data: p.fields })
    // A rejected barcode (bad check digit) will never succeed; drop it rather than retry forever.
    return !error || error.code === '22023'
  } catch {
    return false
  }
}
