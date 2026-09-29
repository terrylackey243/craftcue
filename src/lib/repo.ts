// All user-facing writes go through here so the backup-reminder change counter stays accurate.
import { db, noteChange, type SecretKey } from '../db'
import { SEED_CATEGORIES } from '../data/categories'
import { getMachine } from '../data'
import type { Artwork, Category, PackColor, Person, Project, Supply, UpcCacheEntry, UserSetup } from '../types'
import { nowIso, uuid } from './ids'

// ----- setup -----

export function defaultSetup(): UserSetup {
  const machine = getMachine('cricut-maker-5')
  const t = nowIso()
  return {
    id: 'setup',
    machineId: machine?.id ?? 'generic',
    ownedToolIds: machine?.defaultTools ?? [],
    equipment: [],
    equipmentOther: '',
    skillLevel: 'beginner',
    interests: [],
    aiEnabled: false,
    quality: 'standard',
    upcLookupEnabled: false,
    backupReminder: { enabled: true, afterChanges: 50, afterDays: 14 },
    fontScale: 1,
    setupComplete: false,
    createdAt: t,
    updatedAt: t,
  }
}

export async function getSetup(): Promise<UserSetup> {
  return (await db.setup.get('setup')) ?? defaultSetup()
}

export async function saveSetup(patch: Partial<UserSetup>): Promise<UserSetup> {
  // Read-modify-write in one transaction so rapid taps can't overwrite each other.
  const next = await db.transaction('rw', db.setup, async () => {
    const merged = { ...(await getSetup()), ...patch, id: 'setup' as const, updatedAt: nowIso() }
    await db.setup.put(merged)
    return merged
  })
  await noteChange()
  return next
}

// ----- categories -----

export async function allCategories(): Promise<Category[]> {
  const custom = await db.categories.toArray()
  return [...SEED_CATEGORIES.filter((c) => c.id !== 'other'), ...custom, SEED_CATEGORIES.find((c) => c.id === 'other')!]
}

export async function addCategory(name: string): Promise<Category> {
  const clean = name.trim()
  const id = `custom-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${uuid().slice(0, 4)}`
  const cat: Category = { id, name: clean, units: ['piece', 'pack', 'other'], sizes: [], custom: true }
  await db.categories.put(cat)
  await noteChange()
  return cat
}

export async function deleteCategory(id: string): Promise<void> {
  // Supplies in a deleted category move to "Other" rather than disappearing.
  await db.transaction('rw', db.categories, db.supplies, async () => {
    await db.supplies.where('category').equals(id).modify({ category: 'other' })
    await db.categories.delete(id)
  })
  await noteChange()
}

// ----- supplies -----

export type SupplyInput = Omit<Supply, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function saveSupply(input: SupplyInput): Promise<Supply> {
  const t = nowIso()
  const existing = input.id ? await db.supplies.get(input.id) : undefined
  const supply: Supply = {
    ...input,
    id: existing?.id ?? input.id ?? uuid(),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    quantity: Math.max(0, Number(input.quantity) || 0),
  }
  await db.supplies.put(supply)
  await noteChange()
  return supply
}

export async function saveSupplies(inputs: SupplyInput[]): Promise<Supply[]> {
  const t = nowIso()
  const rows: Supply[] = inputs.map((s) => ({
    ...s,
    id: s.id ?? uuid(),
    createdAt: t,
    updatedAt: t,
    quantity: Math.max(0, Number(s.quantity) || 0),
  }))
  await db.supplies.bulkPut(rows)
  await noteChange(rows.length)
  return rows
}

export async function adjustQuantity(id: string, delta: number): Promise<void> {
  const s = await db.supplies.get(id)
  if (!s) return
  const q = Math.max(0, roundQty(s.quantity + delta))
  await db.supplies.update(id, { quantity: q, updatedAt: nowIso() })
  await noteChange()
}

export async function deleteSupply(id: string): Promise<void> {
  await db.supplies.delete(id)
  await noteChange()
}

/** Avoid 0.30000000000000004 after repeated fractional edits. */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ----- UPC cache (spec 4.6) -----

export async function cacheUpc(upc: string, proposed: Partial<Supply> & { colors?: PackColor[] }): Promise<void> {
  const existing = await db.upcCache.get(upc)
  // Only the product description is cached; quantity, location, cost and photo are per-purchase.
  const { quantity: _q, location: _l, unitCost: _c, packPrice: _pp, setId: _sid, packOrder: _po, thumbnail: _t, notes: _n, id: _i, createdAt: _ca, updatedAt: _ua, source: _s, ...product } = proposed
  const entry: UpcCacheEntry = {
    upc,
    proposedSupply: product,
    confirmedAt: nowIso(),
    timesUsed: (existing?.timesUsed ?? 0) + 1,
  }
  await db.upcCache.put(entry)
}

// ----- people -----

export async function savePerson(input: Omit<Person, 'createdAt' | 'updatedAt' | 'id' | 'pastGiftProjectIds'> & { id?: string; pastGiftProjectIds?: string[] }): Promise<Person> {
  const t = nowIso()
  const existing = input.id ? await db.people.get(input.id) : undefined
  const person: Person = {
    ...input,
    id: existing?.id ?? uuid(),
    pastGiftProjectIds: input.pastGiftProjectIds ?? existing?.pastGiftProjectIds ?? [],
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  }
  await db.people.put(person)
  await noteChange()
  return person
}

export async function deletePerson(id: string): Promise<void> {
  await db.transaction('rw', db.people, db.projects, async () => {
    await db.projects.where('personId').equals(id).modify({ personId: undefined })
    await db.people.delete(id)
  })
  await noteChange()
}

// ----- projects -----

export async function saveProject(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Project> {
  const t = nowIso()
  const existing = input.id ? await db.projects.get(input.id) : undefined
  const project: Project = { ...input, id: existing?.id ?? input.id ?? uuid(), createdAt: existing?.createdAt ?? t, updatedAt: t }
  await db.projects.put(project)
  await noteChange()
  return project
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: nowIso() })
  await noteChange()
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.artwork, async () => {
    await db.projects.delete(id)
    await db.artwork.where('projectId').equals(id).delete()
  })
  await noteChange()
}

// ----- artwork (image add-ons) -----

export async function saveArtwork(input: Omit<Artwork, 'id' | 'createdAt' | 'updatedAt'>): Promise<Artwork> {
  const t = nowIso()
  const art: Artwork = { ...input, id: uuid(), createdAt: t, updatedAt: t }
  await db.artwork.add(art)
  await noteChange()
  return art
}

export async function deleteArtwork(id: string): Promise<void> {
  await db.artwork.delete(id)
  await noteChange()
}

// ----- secrets -----

export async function getSecret(key: SecretKey): Promise<string | undefined> {
  return (await db.secrets.get(key))?.value
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  await db.secrets.put({ key, value: value.trim() })
}

export async function forgetSecret(key: SecretKey): Promise<void> {
  await db.secrets.delete(key)
}

export async function getApiKey(): Promise<string | undefined> {
  return (await db.secrets.get('anthropicApiKey'))?.value
}

export async function setApiKey(key: string): Promise<void> {
  await db.secrets.put({ key: 'anthropicApiKey', value: key.trim() })
}

export async function forgetApiKey(): Promise<void> {
  await db.secrets.delete('anthropicApiKey')
}

export function maskKey(key: string | undefined): string {
  if (!key) return ''
  return `sk-ant-…${key.slice(-4)}`
}

// ----- reset -----

export async function resetEverything(): Promise<void> {
  await db.delete()
  await db.open()
}
