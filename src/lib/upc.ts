// Barcode lookup chain (spec 8.1): local cache → bundled seed → optional online provider → miss.
import { db } from '../db'
import seed from '../data/upc-seed.json'
import type { Supply, UpcCacheEntry } from '../types'

export type UpcHit = { from: 'cache' | 'shared' | 'seed' | 'online'; supply: Partial<Supply>; status?: 'confirmed' | 'unconfirmed'; supporters?: number }

/** Interface for an online lookup. None ships enabled: see CONTRIBUTING.md for the CORS requirement. */
export interface UpcLookupProvider {
  id: string
  name: string
  /** Host to add to the CSP connect-src in vite.config.ts. */
  host: string
  lookup(upc: string): Promise<Partial<Supply> | undefined>
}

export const PROVIDERS: UpcLookupProvider[] = []

interface SeedEntry {
  upc: string
  supply: Partial<Supply>
  source?: string
}

const SEED = new Map((seed.entries as SeedEntry[]).map((e) => [normalizeUpc(e.upc), e.supply]))

/** Strip non-digits; treat a 12-digit UPC-A and its 13-digit EAN form (leading 0) as the same. */
export function normalizeUpc(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.length === 13 && d.startsWith('0') ? d.slice(1) : d
}

export function isValidUpc(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(d.length)) return false
  const digits = d.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export async function lookupUpc(raw: string, opts: { onlineEnabled: boolean } = { onlineEnabled: false }): Promise<UpcHit | undefined> {
  const upc = normalizeUpc(raw)
  const cached = await db.upcCache.get(upc)
  if (cached) {
    await db.upcCache.update(upc, { timesUsed: cached.timesUsed + 1 })
    return { from: 'cache', supply: cached.proposedSupply }
  }
  // The shared catalog other crafters built (only in builds with accounts).
  const { lookupShared } = await import('./cloud/products')
  const shared = await lookupShared(upc)
  if (shared) return { from: 'shared', supply: shared.supply, status: shared.status, supporters: shared.supporters }
  const seeded = SEED.get(upc)
  if (seeded) return { from: 'seed', supply: seeded }
  if (opts.onlineEnabled) {
    for (const p of PROVIDERS) {
      try {
        const hit = await p.lookup(upc)
        if (hit) return { from: 'online', supply: hit }
      } catch {
        // try the next provider
      }
    }
  }
  return undefined
}

/** Turn the local scan cache into seed-file entries a contributor can paste into upc-seed.json. */
export function cacheToSeed(entries: UpcCacheEntry[]): SeedEntry[] {
  return entries.map((e) => ({ upc: e.upc, supply: e.proposedSupply, source: 'contributed from a scan cache' }))
}
