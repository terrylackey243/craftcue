import { describe, expect, it } from 'vitest'
import { checkSuggestion } from '../../src/lib/ai/validate'
import { colorSatisfies } from '../../src/lib/colorGuess'
import { stashMatchFor } from '../../src/lib/colorMatch'
import { buildShoppingList } from '../../src/lib/shopping'
import type { Project, Supply, UserSetup } from '../../src/types'

const card = (id: string, color: string, colorHex?: string): Supply =>
  ({ id, name: 'Cardstock', color, colorHex, category: 'cardstock-paper', quantity: 4, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '' }) as Supply

describe('matching by color, not by name', () => {
  it('"brown" is satisfied by brown supplies whatever they are called, not by mustard', () => {
    expect(colorSatisfies('brown', card('a', 'Dirt', '#6b4f2f'))).toBe(true)
    expect(colorSatisfies('brown', card('b', 'Kraft', '#c8a47e'))).toBe(true)
    expect(colorSatisfies('brown', card('c', 'Tan 4', '#8a6a48'))).toBe(true)
    expect(colorSatisfies('brown', card('d', 'Mustard', '#c8a415'))).toBe(false)
    expect(colorSatisfies('brown', card('e', 'Husk'))).toBeNull() // no swatch, no color word
    expect(colorSatisfies('cardstock', card('a', 'Dirt', '#6b4f2f'))).toBeNull() // no color asked for
  })

  it('finds the stash supply for "brown cardstock", and checks the material too', () => {
    const vinyl = { ...card('v', 'Coffee', '#6b4f2f'), name: 'Permanent vinyl', category: 'adhesive-vinyl' } as Supply
    const stash = [card('m', 'Mustard', '#c8a415'), vinyl, card('d', 'Dirt', '#6b4f2f')]
    expect(stashMatchFor('Brown cardstock', stash)?.id).toBe('d')
    expect(stashMatchFor('Brown vinyl', stash)?.id).toBe('v')
    expect(stashMatchFor('Teal cardstock', stash)).toBeNull()
  })

  it('a suggestion asking for brown cardstock counts Dirt as on hand', () => {
    const setup = { ownedToolIds: [], equipment: [] } as unknown as UserSetup
    const raw = {
      title: 'Leaf garland', uses: [], toolsNeeded: [], equipmentNeeded: [],
      missing: [{ item: 'Brown cardstock', why: 'for the stems', estCost: '$1' }],
    } as never
    const c = checkSuggestion(raw, [card('d', 'Dirt', '#6b4f2f')], setup)
    expect(c.bucket).toBe('now')
    expect(c.suggestion.uses).toEqual([{ supplyId: 'd', amount: 1, unit: 'sheet' }])
    expect(c.warnings[0]).toMatch(/Brown cardstock → you have Dirt Cardstock \(close match\)/)
  })

  it('the shopping list skips colors already on hand', () => {
    const p = { id: 'p', title: 'Garland', status: 'planned', missing: [{ item: 'Brown cardstock', why: '' }, { item: 'Twine', why: '' }] } as unknown as Project
    expect(buildShoppingList([p], [card('d', 'Dirt', '#6b4f2f')]).map((l) => l.item)).toEqual(['Twine'])
  })
})
