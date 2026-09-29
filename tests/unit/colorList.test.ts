import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db'
import { addColorsToPack, groupStash, parseColorList, saveAssortment } from '../../src/lib/assortment'

// Terry's list, exactly as pasted (bullets, trailing commas, a final full stop, one line without a comma).
const TERRY = `* Black,
* Red,
* Blue,
* Green,
* Yellow,
* Sour Apple,
* Candy Corn,
* Blueberry,
* Candy Crystal,
* Very Berry,
* Cactus Pink,
* Bluebonnet,
* Lavender,
* Honeysuckle,
* Sage,
* Armadillo,
* Geode,
* Brick,
* Adobe Clay,
* Moccasin,
* Jade,
* Gemstone Blue,
* Wine,
* Pink Crystal,
* Coral,
* Turquoise,
* Tawny,
* Light Green,
* Light Turquoise
* Magenta.`

describe('pasting a color list', () => {
  it('reads Terry’s marker list as 30 clean names in order', () => {
    const names = parseColorList(TERRY)
    expect(names).toHaveLength(30)
    expect(names.slice(0, 6)).toEqual(['Black', 'Red', 'Blue', 'Green', 'Yellow', 'Sour Apple'])
    expect(names.slice(-2)).toEqual(['Light Turquoise', 'Magenta'])
  })

  it('handles commas on one line, numbering, blanks and repeats', () => {
    expect(parseColorList('Red, Blue;Green\n\n1. Pink\n2) Plum\n- red\n• Gold.')).toEqual(['Red', 'Blue', 'Green', 'Pink', 'Plum', 'Gold'])
  })
})

describe('adding colors to a saved pack', () => {
  beforeEach(async () => {
    await db.supplies.clear()
  })

  it('adds the 29 missing markers, keeps Sour Apple, and puts the pack in the list’s order', async () => {
    const [sourApple] = await saveAssortment({
      base: { name: 'Fine Point Pens', category: 'paint-markers', brand: 'Cricut', subtype: '0.4 mm', unit: 'piece', source: 'manual' },
      setName: 'Fine Point Pens',
      colors: [{ color: 'Sour Apple', count: 1 }],
      packs: 1,
    })
    await db.supplies.update(sourApple.id, { quantity: 2 }) // a real edit must survive

    const r = await addColorsToPack([sourApple], parseColorList(TERRY), 1)
    expect(r).toEqual({ added: 29, reordered: true })

    const set = groupStash(await db.supplies.toArray())[0] as Extract<ReturnType<typeof groupStash>[number], { kind: 'set' }>
    expect(set.items).toHaveLength(30)
    expect(set.items[5].color).toBe('Sour Apple')
    expect(set.items[5].quantity).toBe(2)
    expect(set.items[0].color).toBe('Black')
    expect(set.items.every((s) => s.brand === 'Cricut' && s.subtype === '0.4 mm' && s.setId === sourApple.setId)).toBe(true)
    expect(set.items.filter((s) => s.color !== 'Sour Apple').every((s) => s.quantity === 1)).toBe(true)
  })

  it('a partial list adds new colors after the existing ones without reordering', async () => {
    const saved = await saveAssortment({ base: { name: 'Pens', category: 'paint-markers', unit: 'piece', source: 'manual' }, setName: 'Pens', colors: [{ color: 'Red', count: 1 }, { color: 'Blue', count: 1 }], packs: 1 })
    const r = await addColorsToPack(saved, ['Green', 'Red'], 1)
    expect(r).toEqual({ added: 1, reordered: false })
    const set = groupStash(await db.supplies.toArray())[0] as Extract<ReturnType<typeof groupStash>[number], { kind: 'set' }>
    expect(set.items.map((s) => s.color)).toEqual(['Red', 'Blue', 'Green'])
  })
})
