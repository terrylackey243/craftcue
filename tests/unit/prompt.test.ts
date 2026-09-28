import { describe, expect, it } from 'vitest'
import { compactInventory, describeRequest, supplyLine } from '../../src/lib/ai/prompt'
import { SEED_CATEGORIES } from '../../src/data/categories'
import type { Supply, UserSetup } from '../../src/types'
import { defaultSetup } from '../../src/lib/repo'

const cats = new Map(SEED_CATEGORIES.map((c) => [c.id, c]))

function mk(i: number, category: string, quantity = 1): Supply {
  return { id: `s${i}`, name: `Item ${i}`, category, quantity, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '' }
}

describe('inventory compaction (spec 9.2)', () => {
  it('writes one compact line per supply', () => {
    const line = supplyLine({ ...mk(1, 'adhesive-vinyl', 3), color: 'black', dimensions: '12 x 12 in', subtype: 'permanent' }, 'Adhesive vinyl')
    expect(line).toBe('s1 | Item 1 | Adhesive vinyl | black | 3 sheet | 12 x 12 in | permanent')
  })

  it('keeps everything, empty items included, for small stashes', () => {
    const out = compactInventory([mk(1, 'felt', 0), mk(2, 'felt', 2)], cats, 'decor')
    expect(out.included).toBe(2)
    expect(out.omitted).toBe(0)
  })

  it('for large stashes, drops empty items, puts goal categories first and groups by category', () => {
    const supplies = [
      ...Array.from({ length: 200 }, (_, i) => mk(i, 'embellishments')),
      ...Array.from({ length: 150 }, (_, i) => mk(1000 + i, 'blanks-drinkware')),
      ...Array.from({ length: 20 }, (_, i) => mk(2000 + i, 'blanks-drinkware', 0)),
    ]
    const out = compactInventory(supplies, cats, 'gift', 300)
    expect(out.included).toBe(300)
    expect(out.omitted).toBe(70)
    expect(out.text).not.toContain('s2000 ')
    // Drinkware is a gift category, so all 150 in-stock mugs make the cut and come first.
    expect(out.text.indexOf('## Blanks: drinkware')).toBeLessThan(out.text.indexOf('## Embellishments'))
    expect((out.text.match(/\| Blanks: drinkware \|/g) ?? []).length).toBe(150)
  })
})

describe('request description', () => {
  const setup: UserSetup = { ...defaultSetup(), skillLevel: 'beginner' }
  it('describes a sell request with batch size and the no-shopping flag', () => {
    const text = describeRequest({ goal: 'sell', where: 'online', howMany: 12, onlyWhatIHave: true, maxDifficulty: 2, timeAvailable: 'a weekend', count: 5 }, setup)
    expect(text).toContain('How many to make: 12')
    expect(text).toContain('ONLY USE WHAT I HAVE: yes')
    expect(text).toContain('Give 5 suggestions.')
  })

  it('lists past gifts for the person to avoid repeats', () => {
    const text = describeRequest({ goal: 'gift', occasion: 'birthday', onlyWhatIHave: false, maxDifficulty: 3, timeAvailable: '', count: 3 }, setup, undefined, ['Monogram mug'])
    expect(text).toContain('AVOID (already suggested or made): Monogram mug')
  })
})
