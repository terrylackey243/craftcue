import { describe, expect, it } from 'vitest'
import { analyzeSvgs, amountFor, closestSupplies, layOut } from '../../src/lib/import/materials'
import { priceProject } from '../../src/lib/pricing'
import type { Supply } from '../../src/types'

// Illustrator-style export: colors by class, no real units (so 72 per inch), a hidden layer.
// A 6 × 4 in orange base, two 1 in black eyes on top, and a hidden guide layer.
const GHOST = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 288" width="432" height="288">
  <defs><style>.cls-1{fill:#f7931e;}.cls-2,.cls-3{fill:#231f20}</style></defs>
  <rect class="cls-1" x="0" y="0" width="432" height="288"/>
  <circle class="cls-2" cx="144" cy="100" r="36"/>
  <circle class="cls-3" cx="288" cy="100" r="36"/>
  <g style="display:none"><rect fill="#ff0000" width="432" height="288"/></g>
</svg>`

const sheet = (id: string, color: string, dimensions = '12 x 12 in', unitCost = 0.14): Supply =>
  ({ id, name: 'Cardstock', color, category: 'cardstock-paper', dimensions, quantity: 8, unit: 'sheet', unitCost, source: 'manual', createdAt: '', updatedAt: '' }) as Supply

describe('working out materials from a cut file', () => {
  it('reads class colors, skips hidden layers, and assumes 72 per inch when the file has no units', () => {
    const a = analyzeSvgs([{ name: 'ghost.svg', text: GHOST }])
    expect(a.sizeAssumed).toBe(true)
    expect(a.widthIn).toBeCloseTo(6, 1)
    expect(a.heightIn).toBeCloseTo(4, 1)
    expect(a.colors.map((c) => c.hex)).toEqual(['#f7931e', '#231f20'])
    expect(a.colors[1].pieces).toHaveLength(2)
    expect(a.colors[1].pieces[0].w).toBeCloseTo(1, 1)
  })

  it('uses the real size when the file states it, and resizes on request', () => {
    const inInches = GHOST.replace('width="432" height="288"', 'width="12in" height="8in"')
    expect(analyzeSvgs([{ name: 'g.svg', text: inInches }]).widthIn).toBeCloseTo(12, 1)
    expect(analyzeSvgs([{ name: 'g.svg', text: GHOST }], 1.5).widthIn).toBeCloseTo(9, 1)
  })

  it('lays pieces out on sheets like the mat preview', () => {
    // Four 5.5 × 5.5 in pieces fit on one 12 × 12 sheet (2 × 2), five need two.
    expect(layOut(Array(4).fill({ w: 5.5, h: 5.5 }), 12, 12).sheets).toBe(1)
    expect(layOut(Array(5).fill({ w: 5.5, h: 5.5 }), 12, 12).sheets).toBe(2)
    // A 10 × 4 piece turns to fit 8.5 × 11 paper.
    expect(layOut([{ w: 10, h: 4 }], 8.5, 11)).toMatchObject({ sheets: 1, tooBig: 0 })
    expect(layOut([{ w: 13, h: 13 }], 12, 12).tooBig).toBe(1)
    // On a 12 in roll, two 5 in rows of pieces use about 10.75 in.
    expect(layOut(Array(4).fill({ w: 5, h: 5 }), 12, Infinity).lengthIn).toBeCloseTo(10.75, 2)
  })

  it('matches colors to the stash and counts sheets of that material', () => {
    const a = analyzeSvgs([{ name: 'ghost.svg', text: GHOST }], 2) // 12 × 8 in
    const stash = [sheet('blk', 'Eclipse Black'), sheet('org', 'Orbit Orange'), sheet('red', 'Re-Entry Red'), sheet('ltr', 'Cosmic Orange', '8.5 x 11 in')]
    expect(closestSupplies(a.colors[0].hex, stash)[0].supply.color).toMatch(/Orange/)
    expect(closestSupplies(a.colors[1].hex, stash)[0].supply.id).toBe('blk')
    // 12 × 8 in base doesn't fit inside a 12 × 12 mat's margins (11.5 wide), nor on letter paper.
    expect(amountFor(a.colors[0], stash[1]).tooBig).toBe(1)
    expect(amountFor(a.colors[1], stash[0])).toMatchObject({ amount: 1, unit: 'sheet', tooBig: 0 })
  })
})

describe('pricing', () => {
  it('adds materials, time and profit, and covers Etsy fees', () => {
    const stash = [sheet('a', 'Black', '12 x 12 in', 0.14), sheet('b', 'White', '12 x 12 in')]
    const glue = { ...sheet('g', 'clear'), name: 'Glue', unit: 'bottle', unitCost: 12, category: 'adhesives-glue' } as Supply
    const b = priceProject(
      { uses: [{ supplyId: 'a', amount: 3, unit: 'sheet' }, { supplyId: 'g', amount: 0.05, unit: 'bottle' }], missing: [{ item: 'Tea light', why: '', estCost: '~$0.40' }], estMinutes: 120 },
      [...stash, glue],
      { hourlyRate: 15, profitPct: 20 },
    )
    expect(b.materials).toBeCloseTo(0.42 + 0.6 + 0.4)
    expect(b.labor).toBe(30)
    expect(b.price).toBe(Math.ceil((1.42 + 30) * 1.2)) // $38
    expect(b.etsyPrice).toBe(Math.ceil((b.price + 0.45) / 0.905)) // $43
    expect(b.unpriced).toEqual([])
  })

  it('lists materials with no price', () => {
    const noPrice = { ...sheet('x', 'Gold'), unitCost: undefined }
    expect(priceProject({ uses: [{ supplyId: 'x', amount: 1, unit: 'sheet' }], missing: [{ item: 'Ribbon', why: '' }] }, [noPrice], {}).unpriced).toEqual(['Cardstock — Gold', 'Ribbon'])
  })
})
