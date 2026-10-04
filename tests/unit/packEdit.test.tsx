import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db'
import { packValue, refigurePackCost, saveAssortment, updatePack } from '../../src/lib/assortment'
import { saveSetup } from '../../src/lib/repo'
import PackEdit from '../../src/screens/PackEdit'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await saveSetup({ setupComplete: true })
})

const pens = () =>
  saveAssortment({
    base: { name: 'Fine point pen', category: 'paint-markers', unit: 'piece', source: 'manual', brand: 'Cricut', location: 'Drawer 2' },
    setName: 'Cricut Fine Point Pens',
    colors: [{ color: 'Black', count: 1 }, { color: 'Sour Apple', count: 1 }, { color: 'Wine', count: 1 }],
    packs: 1,
  })

describe('editing a whole pack', () => {
  it('changes shared details on every color and leaves each color’s own details alone', async () => {
    const saved = await pens()
    await db.supplies.update(saved[1].id, { quantity: 0, location: 'Desk' })
    await updatePack(saved, { lowAt: 0, packPrice: 30, brand: '', setName: 'Cricut Pens 30 pack' })
    const after = await db.supplies.bulkGet(saved.map((s) => s.id))
    for (const s of after) {
      expect(s!.lowAt).toBe(0)
      expect(s!.packPrice).toBe(30)
      expect(s!.unitCost).toBe(10) // $30 ÷ 3 pens
      expect(s!.brand).toBeUndefined() // a cleared field is cleared everywhere
      expect(s!.setName).toBe('Cricut Pens 30 pack')
    }
    expect(after.map((s) => s!.color)).toEqual(['Black', 'Sour Apple', 'Wine'])
    expect(after[1]!.quantity).toBe(0)
    expect(after[1]!.location).toBe('Desk') // not in the patch, so untouched
    expect(packValue(after as never, 'location')).toEqual({ value: 'Drawer 2', mixed: true })
    expect(packValue(after as never, 'lowAt')).toEqual({ value: 0, mixed: false })
  })

  it('fixes a wrong per-color count (Terry’s pens: one color said 30), re-figuring cost per piece', async () => {
    const saved = await pens()
    await db.supplies.update(saved[0].id, { packSize: 30 })
    await updatePack(await db.supplies.toArray(), { packPrice: 3.99 })
    expect((await db.supplies.get(saved[1].id))!.unitCost).toBeCloseTo(3.99 / 32) // wrong: 30 + 1 + 1
    await updatePack(await db.supplies.toArray(), { packSize: 1 })
    for (const s of await db.supplies.toArray()) {
      expect(s.packSize).toBe(1)
      expect(s.unitCost).toBeCloseTo(1.33)
    }
  })

  it('changing one color’s count on its own page re-figures the whole pack (Sour Apple at $39.99 a pen)', async () => {
    const saved = await pens()
    // What Terry's data looked like: the single-item form priced one color alone.
    await db.supplies.update(saved[0].id, { packSize: 1, packPrice: 39.99, unitCost: 39.99 })
    await refigurePackCost(saved[0].setId!, 39.99)
    for (const s of await db.supplies.toArray()) {
      expect(s.packPrice).toBe(39.99)
      expect(s.unitCost).toBeCloseTo(13.33) // 39.99 ÷ 3 pens in this test pack
    }
  })

  it('the Edit pack screen saves only what was changed, for all colors', async () => {
    const saved = await pens()
    await db.supplies.update(saved[1].id, { location: 'Desk' })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/pack/${saved[0].setId}`]}>
        <Routes>
          <Route path="/pack/:setId" element={<PackEdit />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Cricut Fine Point Pens · 3 colors/)).toBeInTheDocument()
    // Where it's kept differs, so it starts blank with a note.
    expect(screen.getByLabelText('Where you keep it (optional)')).toHaveValue('')
    expect(screen.getAllByText(/Different for each color now/).length).toBeGreaterThan(0)
    // Low-stock level: 1 → 0.
    await user.click(screen.getByRole('button', { name: /Less.*warn when each color/i }))
    await user.click(screen.getByRole('button', { name: 'Save for all 3 colors' }))
    expect(await screen.findByText('Saved for all 3 colors.')).toBeInTheDocument()
    await waitFor(async () => expect((await db.supplies.toArray()).every((s) => s.lowAt === 0)).toBe(true))
    expect((await db.supplies.get(saved[1].id))!.location).toBe('Desk')
    expect((await db.supplies.get(saved[0].id))!.location).toBe('Drawer 2')
    // Each color links to its own page.
    expect(screen.getByRole('link', { name: /Sour Apple/ })).toHaveAttribute('href', `/supply/${saved[1].id}`)
  })
})
