// Mixed-color packs (e.g. a 75-sheet cardstock pack in 25 colors). Each color becomes its own
// supply, so suggestions, deductions and low-stock work per color; they share a set id/name.
import { db } from '../db'
import type { PackColor, Supply } from '../types'
import { uuid } from './ids'
import { roundQty, saveSupplies, type SupplyInput } from './repo'
import { noteChange } from '../db'

export interface AssortmentDraft {
  /** Details every color shares: name (e.g. "Astrobrights cardstock"), category, brand, size… */
  base: Omit<SupplyInput, 'color' | 'quantity' | 'packSize' | 'unitCost' | 'setId' | 'setName'>
  setName: string
  colors: PackColor[]
  packPrice?: number
  /** How many packs were bought (each color gets count × packs). */
  packs: number
}

export function cleanColors(colors: PackColor[]): PackColor[] {
  const out = new Map<string, PackColor>()
  for (const c of colors) {
    const color = c.color.trim()
    const count = Number(c.count)
    if (!color || !(count > 0)) continue
    const key = color.toLowerCase()
    const prev = out.get(key)
    out.set(key, { color: prev?.color ?? color, count: roundQty((prev?.count ?? 0) + count) })
  }
  return [...out.values()]
}

export function totalCount(colors: PackColor[]): number {
  return roundQty(colors.reduce((sum, c) => sum + (Number(c.count) || 0), 0))
}

/** Same cost per sheet for every color: pack price ÷ everything in the pack. */
export function costPerUnit(colors: PackColor[], packPrice: number | undefined): number | undefined {
  const total = totalCount(colors)
  return packPrice !== undefined && total > 0 ? packPrice / total : undefined
}

/** Save a new mixed pack as one supply per color. */
export async function saveAssortment(d: AssortmentDraft): Promise<Supply[]> {
  const colors = cleanColors(d.colors)
  if (!colors.length) throw new Error('Add at least one color.')
  const setId = uuid()
  const unitCost = costPerUnit(colors, d.packPrice)
  const packs = Math.max(1, d.packs || 1)
  return saveSupplies(
    colors.map((c, i) => ({
      ...d.base,
      packOrder: i,
      name: d.base.name.trim(),
      color: c.color,
      quantity: roundQty(c.count * packs),
      packSize: c.count,
      unitCost,
      setId,
      setName: d.setName.trim() || d.base.name.trim(),
    })),
  )
}

/**
 * Bought the same mixed pack again: add each color's per-pack count to what's there, and add any
 * colors that are new. Matches existing supplies by barcode, then by set.
 */
export async function addAnotherPack(existing: Supply[], colors: PackColor[], packs = 1): Promise<number> {
  const byColor = new Map(existing.map((s) => [(s.color ?? '').trim().toLowerCase(), s]))
  const template = existing[0]
  const now = new Date().toISOString()
  const updates: Supply[] = []
  const creates: SupplyInput[] = []
  let nextOrder = Math.max(-1, ...existing.map((s) => s.packOrder ?? -1)) + 1
  for (const c of cleanColors(colors)) {
    const hit = byColor.get(c.color.toLowerCase())
    if (hit) updates.push({ ...hit, quantity: roundQty(hit.quantity + c.count * packs), packSize: c.count, updatedAt: now })
    else if (template) {
      const { id: _id, createdAt: _c, updatedAt: _u, thumbnail: _t, ...rest } = template
      creates.push({ ...rest, color: c.color, quantity: roundQty(c.count * packs), packSize: c.count, packOrder: nextOrder++ })
    }
  }
  if (updates.length) {
    await db.supplies.bulkPut(updates)
    await noteChange(updates.length)
  }
  if (creates.length) await saveSupplies(creates)
  return updates.length + creates.length
}

/** The colors (and per-pack counts) of an existing set, for sharing or re-buying. */
export function colorsOf(set: Supply[]): PackColor[] {
  return [...set]
    .sort((a, b) => (a.packOrder ?? Infinity) - (b.packOrder ?? Infinity))
    .filter((s) => s.color)
    .map((s) => ({ color: s.color!, count: s.packSize ?? s.quantity }))
}

/** Group supplies for display: sets become one group, everything else stays single. */
export type StashEntry = { kind: 'single'; supply: Supply } | { kind: 'set'; setId: string; name: string; items: Supply[] }

export function groupStash(supplies: Supply[]): StashEntry[] {
  const out: StashEntry[] = []
  const sets = new Map<string, Extract<StashEntry, { kind: 'set' }>>()
  for (const s of supplies) {
    if (!s.setId) {
      out.push({ kind: 'single', supply: s })
      continue
    }
    let g = sets.get(s.setId)
    if (!g) {
      g = { kind: 'set', setId: s.setId, name: s.setName || s.name, items: [] }
      sets.set(s.setId, g)
      out.push(g)
    }
    g.items.push(s)
  }
  // Colors keep the order printed on the pack; older entries without one fall back to A–Z.
  for (const g of sets.values())
    g.items.sort((a, b) => (a.packOrder ?? Infinity) - (b.packOrder ?? Infinity) || (a.color ?? '').localeCompare(b.color ?? ''))
  return out
}

/** Save a new color order for a pack (ids in the order they should appear). */
export async function reorderSet(items: Supply[], orderedIds: string[]): Promise<void> {
  const byId = new Map(items.map((s) => [s.id, s]))
  const now = new Date().toISOString()
  const changed: Supply[] = []
  orderedIds.forEach((id, i) => {
    const s = byId.get(id)
    if (s && s.packOrder !== i) changed.push({ ...s, packOrder: i, updatedAt: now })
  })
  if (changed.length) {
    await db.supplies.bulkPut(changed)
    await noteChange()
  }
}

/** Give every color of a pack the pack's barcode; remember it so the next scan fills in the pack. */
export async function setPackBarcode(items: Supply[], upc: string): Promise<void> {
  const now = new Date().toISOString()
  await db.supplies.bulkPut(items.map((s) => ({ ...s, upc, updatedAt: now })))
  await noteChange()
  const first = [...items].sort((a, b) => (a.packOrder ?? 0) - (b.packOrder ?? 0))[0]
  const product = {
    name: first.name,
    setName: first.setName,
    category: first.category,
    brand: first.brand,
    subtype: first.subtype,
    dimensions: first.dimensions,
    unit: first.unit,
    packSize: totalCount(colorsOf(items)),
    colors: colorsOf(items),
  }
  const { cacheUpc } = await import('./repo')
  await cacheUpc(upc, product)
  void import('./cloud/products').then((m) => m.contributeProduct(upc, product))
}
