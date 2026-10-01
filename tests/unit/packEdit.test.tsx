import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db'
import { packValue, saveAssortment, updatePack } from '../../src/lib/assortment'
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
