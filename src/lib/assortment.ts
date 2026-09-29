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
  const updates: { id: string; add: number; packSize: number }[] = []
  const creates: SupplyInput[] = []
  let nextOrder = Math.max(-1, ...existing.map((s) => s.packOrder ?? -1)) + 1
  for (const c of cleanColors(colors)) {
    const hit = byColor.get(c.color.toLowerCase())
    if (hit) updates.push({ id: hit.id, add: c.count * packs, packSize: c.count })
    else if (template) {
      const { id: _id, createdAt: _c, updatedAt: _u, thumbnail: _t, ...rest } = template
      creates.push({ ...rest, color: c.color, quantity: roundQty(c.count * packs), packSize: c.count, packOrder: nextOrder++ })
    }
  }
  if (updates.length) {
    await db.transaction('rw', db.supplies, async () => {
      for (const u of updates) {
        const current = await db.supplies.get(u.id)
        if (current) await db.supplies.update(u.id, { quantity: roundQty(current.quantity + u.add), packSize: u.packSize, updatedAt: now })
      }
    })
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

/**
 * An existing pack with the same name and the same colors, if there is one. Used to ask "did you
 * buy another?" instead of silently making a second copy.
 */
export async function findSamePack(name: string, setName: string, colors: PackColor[]): Promise<Supply[] | null> {
  const norm = (t: string | undefined) => (t ?? '').trim().toLowerCase()
  const wantColors = cleanColors(colors).map((c) => norm(c.color)).sort().join('|')
  const sets = new Map<string, Supply[]>()
  for (const s of await db.supplies.filter((x) => Boolean(x.setId)).toArray()) {
    const list = sets.get(s.setId!) ?? []
    list.push(s)
    sets.set(s.setId!, list)
  }
  for (const items of sets.values()) {
    const first = items[0]
    const sameName = norm(first.name) === norm(name) && norm(first.setName) === norm(setName || name)
    const sameColors = items.map((s) => norm(s.color)).sort().join('|') === wantColors
    if (sameName && sameColors) return items
  }
  return null
}

/** Save a new color order for a pack (ids in the order they should appear). */
export async function reorderSet(items: Supply[], orderedIds: string[]): Promise<void> {
  // Only the position changes: never write back a possibly out-of-date copy of the whole item.
  const ids = new Set(items.map((s) => s.id))
  const now = new Date().toISOString()
  let changed = 0
  await db.transaction('rw', db.supplies, async () => {
    for (const [i, id] of orderedIds.entries()) {
      if (!ids.has(id)) continue
      const current = await db.supplies.get(id)
      if (current && current.packOrder !== i) changed += await db.supplies.update(id, { packOrder: i, updatedAt: now })
    }
  })
  if (changed) await noteChange()
}

/** Give every color of a pack the pack's barcode; remember it so the next scan fills in the pack. */
export async function setPackBarcode(items: Supply[], upc: string): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', db.supplies, async () => {
    for (const s of items) await db.supplies.update(s.id, { upc, updatedAt: now })
  })
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

/**
 * Turn a pasted list into color names: one per line or comma-separated, with bullets, numbering
 * and trailing punctuation removed, blanks dropped and repeats merged (keeping the first spelling).
 */
export function parseColorList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,;]+/)) {
    const name = raw
      .replace(/^\s*(?:[-*•·▪◦‣]+|\d+[.)]|\(\d+\))\s*/, '') // bullets and "1." / "2)" numbering
      .replace(/[.\s]+$/, '') // trailing full stops and spaces
      .replace(/\s+/g, ' ')
      .trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * Add colors to a pack you already have (1 of each, or `count`). Colors already in the pack are
 * left alone. If the list includes every color already in the pack, the whole pack is put in the
 * list's order (so it matches the packaging); otherwise new colors go after the existing ones.
 */
export async function addColorsToPack(existing: Supply[], names: string[], count: number): Promise<{ added: number; reordered: boolean }> {
  const have = new Map(existing.map((s) => [(s.color ?? '').trim().toLowerCase(), s]))
  const fresh = names.filter((n) => !have.has(n.trim().toLowerCase()))
  const template = [...existing].sort((a, b) => (a.packOrder ?? 0) - (b.packOrder ?? 0))[0]
  if (!template) return { added: 0, reordered: false }
  const { id: _id, createdAt: _c, updatedAt: _u, thumbnail: _t, color: _col, quantity: _q, packOrder: _po, ...shared } = template
  let next = Math.max(-1, ...existing.map((s) => s.packOrder ?? -1)) + 1
  const created = fresh.length
    ? await saveSupplies(fresh.map((color) => ({ ...shared, color, quantity: count, packSize: count, packOrder: next++ })))
    : []
  const coversAll = existing.every((s) => names.some((n) => n.trim().toLowerCase() === (s.color ?? '').trim().toLowerCase()))
  if (coversAll && existing.length > 0) {
    const all = [...existing, ...created]
    const byColor = new Map(all.map((s) => [(s.color ?? '').trim().toLowerCase(), s.id]))
    await reorderSet(all, names.map((n) => byColor.get(n.trim().toLowerCase())!).filter(Boolean))
    return { added: created.length, reordered: true }
  }
  return { added: created.length, reordered: false }
}
