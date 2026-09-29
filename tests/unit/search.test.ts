import { describe, expect, it } from 'vitest'
import { filterSupplies } from '../../src/screens/Inventory'
import type { Supply } from '../../src/types'

const s = (id: string, over: Partial<Supply>): Supply => ({ id, name: id, category: 'cardstock-paper', quantity: 1, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '', ...over })
const stash = [
  s('red', { name: 'Astrobrights cardstock', setName: 'Spectrum', color: 'Rocket Red', upc: '850012345676', dimensions: '8.5 x 11 in' }),
  s('vinyl', { name: 'Glossy vinyl', category: 'adhesive-vinyl', color: 'black', upc: '036000291452', dimensions: '12 x 12 in', location: 'bin 3' }),
  s('felt', { name: 'Felt sheets', category: 'felt', color: 'rainbow' }),
]
const find = (q: string) => filterSupplies(stash, q, '', '', (c) => (c === 'felt' ? 'Felt' : c === 'adhesive-vinyl' ? 'Adhesive vinyl' : 'Cardstock & paper')).map((x) => x.id)

describe('stash search', () => {
  it('matches every word across different fields', () => {
    expect(find('red cardstock')).toEqual(['red'])
    expect(find('spectrum')).toEqual(['red'])
    expect(find('black bin')).toEqual(['vinyl'])
    expect(find('adhesive')).toEqual(['vinyl'])
  })

  it('finds a supply by its barcode, however it was typed', () => {
    expect(find('850012345676')).toEqual(['red'])
    expect(find('8 50012 34567 6')).toEqual(['red']) // as printed under the bars
    expect(find('0850012345676')).toEqual(['red']) // 13-digit form with a leading zero
    expect(find('345676')).toEqual(['red']) // the last few digits
    expect(find('036000291452')).toEqual(['vinyl'])
    expect(find('999999999999')).toEqual([])
  })

  it('short numbers are still ordinary words, not barcodes', () => {
    expect(find('12 12')).toEqual(['vinyl'])
    expect(find('8.5')).toEqual(['red'])
  })

  it('a barcode can be combined with other words', () => {
    expect(find('red 850012345676')).toEqual(['red'])
    expect(find('black 850012345676')).toEqual([])
  })
})
