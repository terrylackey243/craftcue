// What a project costs to make and what to charge for it: materials (from the stash's own prices)
// + the crafter's time + a little profit, and the price that covers Etsy's fees.
import type { Project, Supply, UserSetup } from '../types'
import { isReusable, toSupplyUnit } from './units'
import { parseMoney } from './money'

export const DEFAULT_HOURLY_RATE = 15
export const DEFAULT_PROFIT_PCT = 20
/** Etsy (2026): 6.5% transaction + 3% + $0.25 payment processing + $0.20 listing. */
export const ETSY = { pct: 0.095, flat: 0.45 }

export interface PriceBreakdown {
  materials: number
  /** Materials with no price in the stash (so the total is low). */
  unpriced: string[]
  labor: number
  profit: number
  /** Materials + time + profit, rounded up to a whole dollar. */
  price: number
  /** Enough more that Etsy's fees still leave `price`. */
  etsyPrice: number
}

export function priceProject(p: Pick<Project, 'uses' | 'missing' | 'estMinutes'>, supplies: Supply[], setup: Pick<UserSetup, 'hourlyRate' | 'profitPct'>): PriceBreakdown {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  let materials = 0
  const unpriced: string[] = []
  for (const u of p.uses) {
    const s = byId.get(u.supplyId)
    if (!s || isReusable(s)) continue
    const amount = toSupplyUnit(u.amount, u.unit, s)
    if (s.unitCost === undefined || amount === undefined) unpriced.push([s.name, s.color].filter(Boolean).join(' — '))
    else materials += amount * s.unitCost
  }
  for (const m of p.missing) {
    // "~$3–5", "about $4": take the first number (the low end).
    const first = /\d+(?:\.\d+)?/.exec(m.estCost ?? '')?.[0]
    const cost = first ? parseMoney(first) : undefined
    if (cost === undefined) unpriced.push(m.item)
    else materials += cost
  }
  const labor = ((p.estMinutes ?? 0) / 60) * (setup.hourlyRate ?? DEFAULT_HOURLY_RATE)
  const profit = (materials + labor) * ((setup.profitPct ?? DEFAULT_PROFIT_PCT) / 100)
  const price = Math.ceil(materials + labor + profit)
  const etsyPrice = Math.ceil((price + ETSY.flat) / (1 - ETSY.pct))
  return { materials, unpriced, labor, profit, price, etsyPrice }
}
