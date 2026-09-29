import { describe, expect, it } from 'vitest'
import { guessCategory } from '../../src/lib/guessCategory'

describe('guessCategory', () => {
  it.each([
    ['Kraft cardstock', 'cardstock-paper'],
    ['Glossy permanent vinyl', 'adhesive-vinyl'],
    ['Glitter HTV', 'iron-on'],
    ['Everyday iron-on vinyl', 'iron-on'],
    ['Infusible ink sheets', 'infusible-ink'],
    ['White 15 oz mugs', 'blanks-drinkware'],
    ['Acrylic paint', 'paint-markers'],
    ['Acrylic keychain blanks', 'acrylic'],
    ['Standard grip mat', 'transfer-tape-mats'],
    ['Printable sticker paper', 'printable'],
    ['Mystery thing', undefined],
  ])('%s → %s', (name, cat) => {
    expect(guessCategory(name)).toBe(cat)
  })
})

import { formatQty } from '../../src/components/SupplyForm'
describe('formatQty', () => {
  it('uses singular for exactly one', () => {
    expect(formatQty(1, 'sheet')).toBe('1 sheet')
    expect(formatQty(1, 'ft')).toBe('1 foot')
    expect(formatQty(2, 'ft')).toBe('2 feet')
    expect(formatQty(1, 'in')).toBe('1 inch')
    expect(formatQty(48, 'in')).toBe('48 inches')
    expect(formatQty(0.25, 'sheet')).toBe('0.25 sheets')
    expect(formatQty(1, 'other')).toBe('1 other')
  })
})
