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
