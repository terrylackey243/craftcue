import { describe, expect, it } from 'vitest'
import { colorLabel, isPlainColor, plainColor, supplyFamily } from '../../src/lib/colorGuess'

describe('plain colors, not brand names', () => {
  it.each([
    // Terry's stash: brand names → the color they are
    ['Rocket Red', 'Red', 'Red (Rocket Red)', 'Red'],
    ['Re-Entry Red', 'Red', 'Red (Re-Entry Red)', 'Red'],
    ['Solar White', 'White', 'White (Solar White)', 'White'],
    ['Escape Black', 'Black', 'Black (Escape Black)', 'Black'],
    ['Lunar Blue', 'Blue', 'Blue (Lunar Blue)', 'Blue'],
    ['Galaxy Gold', 'Gold', 'Gold (Galaxy Gold)', 'Yellow'],
    ['Gamma Green', 'Green', 'Green (Gamma Green)', 'Green'],
    ['Cosmic Orange', 'Orange', 'Orange (Cosmic Orange)', 'Orange'],
    ['Pulsar Pink', 'Pink', 'Pink (Pulsar Pink)', 'Pink'],
    ['Venus Violet', 'Violet', 'Violet (Venus Violet)', 'Purple'],
    ['Brown Kraft', 'Brown Kraft', 'Brown Kraft', 'Brown'],
    // already plain: kept as typed
    ['Light Pink', 'Light Pink', 'Light Pink', 'Pink'],
    ['matte black', 'Matte Black', 'Matte Black', 'Black'],
    ['Red', 'Red', 'Red', 'Red'],
  ])('%s → %s', (color, name, label, family) => {
    expect(plainColor({ color })?.name).toBe(name)
    expect(colorLabel({ color })).toBe(label)
    expect(supplyFamily({ color })).toBe(family)
  })

  it('a picked swatch beats the name, and unknown brand names stay as they are', () => {
    expect(plainColor({ color: 'Outrageous Orchid', colorHex: '#c050b0' })).toEqual({ name: 'Fuchsia', guessed: false }) // closest on the color list
    expect(colorLabel({ color: 'Husk' })).toBe('Husk') // no color word, no swatch: pick one
    expect(plainColor({ color: 'Husk' })).toBeNull()
    expect(plainColor({ color: 'Rocket Red' })?.guessed).toBe(true)
    expect(isPlainColor('Lunar Blue')).toBe(false)
    expect(isPlainColor('Off-White')).toBe(true)
  })
})

describe('finding supplies by color', () => {
  it('search and the color filter use the real color, not the brand name', async () => {
    const { filterSupplies } = await import('../../src/screens/Inventory')
    const base = { name: 'Astrobrights cardstock', category: 'cardstock-paper', quantity: 3, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '' }
    const stash = [
      { ...base, id: '1', color: 'Rocket Red' },
      { ...base, id: '2', color: 'Re-Entry Red' },
      { ...base, id: '3', color: 'Lunar Blue' },
      { ...base, id: '4', color: 'Outrageous Orchid', colorHex: '#c050b0' },
      { ...base, id: '5', color: 'Husk' },
    ] as never[]
    const ids = (r: { id: string }[]) => r.map((s) => s.id)
    const cat = () => 'Cardstock'
    expect(ids(filterSupplies(stash, 'red', '', '', cat))).toEqual(['1', '2'])
    expect(ids(filterSupplies(stash, 'fuchsia', '', '', cat))).toEqual(['4'])
    expect(ids(filterSupplies(stash, '', '', '', cat, 'Blue'))).toEqual(['3'])
    expect(ids(filterSupplies(stash, '', '', '', cat, 'Pink'))).toEqual(['4'])
    expect(ids(filterSupplies(stash, 'husk', '', '', cat))).toEqual(['5']) // brand names still searchable
  })
})

describe('color words inside brand names', () => {
  it('prefers whole words', () => {
    expect(plainColor({ color: 'Martian Green' })?.name).toBe('Green') // not "Tan" from marTiAN
    expect(plainColor({ color: 'Blueberry' })?.name).toBe('Blue')
    expect(plainColor({ color: 'Tangerine Dream' })?.name).toBe('Tangerine')
  })
})

describe('Terry’s stash, checked one by one', () => {
  it.each([
    ['white with black pupils', 'White'],
    ['Sour Apple', 'Lime green'],
    ['Outrageous Orchid', 'Orchid'],
    ['Gravity Grape', 'Grape'],
    ['Very Berry', 'Berry'],
    ['Brick', 'Brick'],
    ['Jade', 'Jade'],
    ['Periwinkle', 'Periwinkle'],
    ['Granite', 'Granite'],
    ['Fuchia', 'Fuchsia'],
    ['Light Grey', 'Light Grey'],
  ])('%s → %s', (color, name) => expect(plainColor({ color })?.name).toBe(name))

  it.each(['Honeysuckle', 'Armadillo', 'Candy Corn', 'Geode', 'Husk'])('%s has no color word: pick a swatch', (color) => expect(plainColor({ color })).toBeNull())

  it('lilac is a purple', () => expect(supplyFamily({ color: 'Lilac' })).toBe('Purple'))
})
