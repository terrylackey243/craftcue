import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import SupplyForm, { emptyDraft } from '../../src/components/SupplyForm'
import { db } from '../../src/db'
import { supplyLine } from '../../src/lib/ai/prompt'
import type { Supply } from '../../src/types'

beforeEach(async () => {
  await db.supplies.clear()
})

function renderForm(onSaved: (s: Supply) => void) {
  render(
    <MemoryRouter>
      <SupplyForm initial={{ ...emptyDraft('embellishments'), name: 'Wiggly eyes', unit: 'piece' }} onSaved={onSaved} />
    </MemoryRouter>,
  )
}

describe('pack pricing on the supply form', () => {
  it('$1.26 for a pack of 80 fills in the per-piece cost; +1 pack adds 80', async () => {
    const user = userEvent.setup()
    let saved: Supply | undefined
    renderForm((s) => (saved = s))

    await user.type(await screen.findByLabelText('Price for the pack ($)'), '1.26')
    await user.type(screen.getByLabelText('How many pieces in a pack'), '80')
    expect(await screen.findByText("That's $0.0158 per piece.")).toBeInTheDocument()

    // A new item starts at 1; the first pack makes it exactly 80, not 81.
    await user.click(screen.getByRole('button', { name: '+1 pack (80)' }))
    expect(screen.getByRole('textbox', { name: 'quantity' })).toHaveValue('80')
    await user.click(screen.getByRole('button', { name: '+1 pack (80)' }))
    expect(screen.getByRole('textbox', { name: 'quantity' })).toHaveValue('160')

    await user.click(screen.getByRole('button', { name: 'Save supply' }))
    await waitFor(() => expect(saved).toBeDefined())
    expect(saved!.quantity).toBe(160)
    expect(saved!.packPrice).toBe(1.26)
    expect(saved!.packSize).toBe(80)
    expect(saved!.unitCost).toBeCloseTo(0.01575, 8)
  })

  it('switching to a per-piece price replaces the pack price', async () => {
    const user = userEvent.setup()
    let saved: Supply | undefined
    renderForm((s) => (saved = s))
    await user.type(await screen.findByLabelText('Price for the pack ($)'), '1.26')
    await user.type(screen.getByLabelText('How many pieces in a pack'), '80')
    await user.click(screen.getByRole('button', { name: 'Price per piece' }))
    await user.type(screen.getByLabelText('Price per piece ($)'), '0.02')
    await user.click(screen.getByRole('button', { name: 'Save supply' }))
    await waitFor(() => expect(saved).toBeDefined())
    expect(saved!.unitCost).toBe(0.02)
    expect(saved!.packPrice).toBeUndefined()
  })

  it('the per-piece cost reaches the suggestion prompt', () => {
    const line = supplyLine({ id: 'x', name: 'Wiggly eyes', category: 'embellishments', quantity: 160, unit: 'piece', unitCost: 1.26 / 80, source: 'manual', createdAt: '', updatedAt: '' }, 'Embellishments')
    expect(line).toContain('cost $0.0158/piece')
  })
})
