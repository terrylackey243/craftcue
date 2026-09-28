import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import AssortmentForm from '../../src/components/AssortmentForm'
import { db } from '../../src/db'
import { addAnotherPack, cleanColors, colorsOf, costPerUnit, groupStash, saveAssortment } from '../../src/lib/assortment'
import { saveSetup } from '../../src/lib/repo'
import type { Supply } from '../../src/types'

const spectrum = ['Rocket Red', 'Solar Yellow', 'Lunar Blue', 'Gamma Green', 'Cosmic Orange'].map((color) => ({ color, count: 3 }))

beforeEach(async () => {
  await Promise.all([db.supplies.clear(), db.upcCache.clear()])
  await saveSetup({ setupComplete: true })
})

describe('mixed-color packs', () => {
  it('saves one supply per color, linked as a set, with the cost split per sheet', async () => {
    const saved = await saveAssortment({
      base: { name: 'Astrobrights cardstock', category: 'cardstock-paper', subtype: '65 lb', dimensions: '8.5 x 11 in', unit: 'sheet', source: 'manual' },
      setName: 'Spectrum assortment',
      colors: spectrum,
      packPrice: 7.5,
      packs: 2,
    })
    expect(saved).toHaveLength(5)
    const red = saved.find((s) => s.color === 'Rocket Red')!
    expect(red.quantity).toBe(6) // 3 per pack × 2 packs
    expect(red.packSize).toBe(3)
    expect(red.unitCost).toBe(0.5) // $7.50 / 15 sheets
    expect(new Set(saved.map((s) => s.setId)).size).toBe(1)
    expect(saved.every((s) => s.setName === 'Spectrum assortment' && s.dimensions === '8.5 x 11 in')).toBe(true)
  })

  it('"add another pack" tops up every color and adds colors that are new', async () => {
    const first = await saveAssortment({ base: { name: 'Cardstock', category: 'cardstock-paper', unit: 'sheet', upc: '036000291452', source: 'manual' }, setName: 'Spectrum', colors: spectrum.slice(0, 3), packs: 1 })
    await addAnotherPack(first, [...spectrum.slice(0, 3), { color: 'Plum', count: 2 }])
    const all = await db.supplies.toArray()
    expect(all.find((s) => s.color === 'Rocket Red')!.quantity).toBe(6)
    const plum = all.find((s) => s.color === 'Plum')!
    expect(plum.quantity).toBe(2)
    expect(plum.setId).toBe(first[0].setId)
    expect(all).toHaveLength(4)
  })

  it('cleans the color list: trims, drops blanks and merges duplicates', () => {
    expect(cleanColors([{ color: ' Red ', count: 2 }, { color: '', count: 3 }, { color: 'red', count: 1 }, { color: 'Blue', count: 0 }])).toEqual([{ color: 'Red', count: 3 }])
    expect(costPerUnit(spectrum, 15)).toBe(1)
    expect(costPerUnit(spectrum, undefined)).toBeUndefined()
  })

  it('groups a set into one entry for My stash, and can read its colors back', async () => {
    const saved = await saveAssortment({ base: { name: 'Cardstock', category: 'cardstock-paper', unit: 'sheet', source: 'manual' }, setName: 'Spectrum', colors: spectrum, packs: 1 })
    const loose = { id: 'x', name: 'Vinyl', category: 'adhesive-vinyl', quantity: 1, unit: 'sheet', source: 'manual', createdAt: '', updatedAt: '' } as Supply
    const entries = groupStash([loose, ...saved])
    expect(entries.map((e) => e.kind)).toEqual(['single', 'set'])
    const set = entries[1] as Extract<(typeof entries)[number], { kind: 'set' }>
    expect(set.items.map((s) => s.color)).toEqual(['Cosmic Orange', 'Gamma Green', 'Lunar Blue', 'Rocket Red', 'Solar Yellow'])
    expect(colorsOf(set.items)).toHaveLength(5)
  })
})

describe('the mixed-pack form', () => {
  it('enter colors, same number of each, price → saves every color', async () => {
    const user = userEvent.setup()
    let saved: Supply[] = []
    render(
      <MemoryRouter>
        <AssortmentForm onSaved={(s) => (saved = s)} />
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText('What is one sheet? (without the color)'), 'Astrobrights cardstock')
    await user.type(screen.getByLabelText('Color 1'), 'Rocket Red{Enter}')
    await user.type(screen.getByLabelText('Color 2'), 'Solar Yellow{Enter}')
    await user.type(screen.getByLabelText('Color 3'), 'Lunar Blue')
    await user.click(screen.getByRole('button', { name: 'Apply to all' })) // default: 3 each
    expect(screen.getByText('3 colors · 9 sheets per pack')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Price for one pack ($) (optional)'), '4.50')
    expect(screen.getByText("That's $0.50 per sheet, for every color.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save 3 colors/ }))
    await waitFor(() => expect(saved).toHaveLength(3))
    expect(saved.map((s) => [s.color, s.quantity])).toEqual([
      ['Rocket Red', 3],
      ['Solar Yellow', 3],
      ['Lunar Blue', 3],
    ])
  })
})
