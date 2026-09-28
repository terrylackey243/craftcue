import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db'
import { cacheUpc } from '../../src/lib/repo'
import { isValidUpc, lookupUpc, normalizeUpc } from '../../src/lib/upc'
import { buildShoppingList, shoppingText, stockLevel } from '../../src/lib/shopping'
import { rollLengthFt, toSupplyUnit } from '../../src/lib/units'
import { summarizeMonth, costOf } from '../../src/lib/ai/models'
import type { Project, Supply } from '../../src/types'

beforeEach(async () => {
  await db.upcCache.clear()
})

describe('barcodes (spec Phase 3 acceptance)', () => {
  it('validates check digits and normalises EAN-13 with a leading zero', () => {
    expect(isValidUpc('036000291452')).toBe(true)
    expect(isValidUpc('036000291453')).toBe(false)
    expect(normalizeUpc('0036000291452')).toBe('036000291452')
  })

  it('the second scan of a product fills in from the local cache with no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await lookupUpc('036000291452')).toBeUndefined()
    await cacheUpc('036000291452', { name: 'Glossy vinyl', category: 'adhesive-vinyl', quantity: 7, location: 'bin 3', unitCost: 2, unit: 'sheet' })
    const hit = await lookupUpc('036000291452')
    expect(hit?.from).toBe('cache')
    expect(hit?.supply.name).toBe('Glossy vinyl')
    // Per-purchase details are never cached.
    expect(hit?.supply.quantity).toBeUndefined()
    expect(hit?.supply.location).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((await db.upcCache.get('036000291452'))!.timesUsed).toBe(2)
    fetchSpy.mockRestore()
  })
})

describe('units', () => {
  it('reads roll lengths', () => {
    expect(rollLengthFt('12 in x 10 ft roll')).toBe(10)
    expect(rollLengthFt('12 in x 5 yd')).toBe(15)
    expect(rollLengthFt('12 x 12 in')).toBeUndefined()
  })
  it('converts between feet, yards and rolls', () => {
    expect(toSupplyUnit(3, 'ft', { unit: 'yd' })).toBe(1)
    expect(toSupplyUnit(5, 'ft', { unit: 'roll', dimensions: '12 in x 10 ft' })).toBe(0.5)
    expect(toSupplyUnit(1, 'roll', { unit: 'ft', dimensions: '12 in x 10 ft' })).toBe(10)
    expect(toSupplyUnit(2, 'sheets', { unit: 'sheet' })).toBe(2)
    expect(toSupplyUnit(1, 'piece', { unit: 'pack' })).toBeUndefined()
  })
})

const supply = (over: Partial<Supply>): Supply => ({ id: 'x', name: 'x', category: 'felt', quantity: 5, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '', ...over })

describe('shopping list', () => {
  it('combines missing items from active projects and low stock', () => {
    const p = (id: string, status: Project['status'], item: string) =>
      ({ id, title: id, status, missing: [{ item, why: '', estCost: '$5' }] }) as unknown as Project
    const lines = buildShoppingList(
      [p('a', 'idea', 'Wood slices'), p('b', 'planned', 'wood  slices'), p('c', 'made', 'Glitter'), p('d', 'dismissed', 'Foam')],
      [supply({ id: 's1', name: 'Mugs', quantity: 0 }), supply({ id: 's2', name: 'Felt', quantity: 1 }), supply({ id: 's3', name: 'Vinyl', quantity: 3, lowAt: 5 }), supply({ id: 's4', quantity: 9 })],
    )
    expect(lines.map((l) => l.item)).toEqual(['Wood slices', 'Mugs', 'Felt', 'Vinyl'])
    expect(lines[0].projectIds).toEqual(['a', 'b'])
    expect(shoppingText(lines, new Set(['s:s1']))).not.toContain('Mugs')
  })
  it('stock levels', () => {
    expect(stockLevel(supply({ quantity: 0 }))).toBe('out')
    expect(stockLevel(supply({ quantity: 1 }))).toBe('low')
    expect(stockLevel(supply({ quantity: 2 }))).toBe('ok')
  })
})

describe('usage meter', () => {
  it('prices calls from pricing.json, including cache reads', () => {
    const c = costOf({ timestamp: '', feature: 'recommend', model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 })
    expect(c).toBeCloseTo(2 + 0.2)
  })
  it('summarises the current month only', () => {
    const now = new Date('2026-09-15T12:00:00')
    const s = summarizeMonth(
      [
        { timestamp: '2026-09-02T12:00:00', feature: 'recommend', model: 'claude-sonnet-5', inputTokens: 0, outputTokens: 5000 },
        { timestamp: '2026-09-03T12:00:00', feature: 'vision-intake', model: 'claude-haiku-4-5', inputTokens: 1500, outputTokens: 300 },
        { timestamp: '2026-08-30T12:00:00', feature: 'recommend', model: 'claude-sonnet-5', inputTokens: 0, outputTokens: 5000 },
      ],
      now,
    )
    expect(s.suggestions).toBe(1)
    expect(s.photoScans).toBe(1)
    expect(s.dollars).toBeCloseTo(0.05 + 0.0015 + 0.0015, 4)
  })
})
