import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db'
import { applyMade, afterDeduction, proposeDeductions } from '../../src/lib/deduction'
import { savePerson, saveProject, saveSupplies } from '../../src/lib/repo'
import type { Project, Supply } from '../../src/types'

async function seed() {
  const [vinyl, mugs, tape, mat] = await saveSupplies([
    { name: 'Black vinyl', category: 'adhesive-vinyl', quantity: 6, unit: 'sheet', source: 'manual' },
    { name: 'Mugs', category: 'blanks-drinkware', quantity: 4, unit: 'blank', source: 'manual' },
    { name: 'Transfer tape', category: 'transfer-tape-mats', quantity: 1, unit: 'roll', dimensions: '12 in x 10 ft', source: 'manual' },
    { name: 'Standard grip mat', category: 'transfer-tape-mats', quantity: 2, unit: 'piece', source: 'manual' },
  ])
  return { vinyl, mugs, tape, mat }
}

function project(uses: Project['uses'], extra: Partial<Project> = {}) {
  return saveProject({
    title: 'Mug',
    summary: '',
    goal: 'gift',
    goalContext: {},
    status: 'idea',
    uses,
    missing: [],
    toolsNeeded: [],
    equipmentNeeded: [],
    steps: [],
    designTips: '',
    safetyNotes: [],
    aiGenerated: true,
    ...extra,
  })
}

beforeEach(async () => {
  await Promise.all([db.supplies.clear(), db.projects.clear(), db.people.clear()])
})

describe('mark as made', () => {
  it('proposes per-item amounts × how many were made, in the supply unit', async () => {
    const { vinyl, mugs, tape, mat } = await seed()
    const rows = proposeDeductions(
      {
        uses: [
          { supplyId: vinyl.id, amount: 0.25, unit: 'sheet' },
          { supplyId: mugs.id, amount: 1, unit: 'blank' },
          { supplyId: tape.id, amount: 1, unit: 'ft' },
          { supplyId: mat.id, amount: 1, unit: 'piece' },
        ],
      },
      await db.supplies.toArray(),
      3,
    )
    const by = Object.fromEntries(rows.map((r) => [r.name, r.amount]))
    expect(by['Black vinyl']).toBe(0.75)
    expect(by['Mugs']).toBe(3)
    expect(by['Transfer tape']).toBe(0.3) // 3 ft of a 10 ft roll
    expect(by['Standard grip mat']).toBeUndefined() // reusable
  })

  it('reduces quantities, never below zero, and records the make', async () => {
    const { vinyl, mugs } = await seed()
    const p = await project([
      { supplyId: vinyl.id, amount: 1, unit: 'sheet' },
      { supplyId: mugs.id, amount: 1, unit: 'blank' },
    ])
    const rows = proposeDeductions(p, await db.supplies.toArray(), 5)
    await applyMade(p.id, rows, 5)
    expect((await db.supplies.get(vinyl.id))!.quantity).toBe(1)
    expect((await db.supplies.get(mugs.id))!.quantity).toBe(0) // wanted 5, had 4
    const after = (await db.projects.get(p.id))!
    expect(after.status).toBe('made')
    expect(after.madeCount).toBe(5)
    expect(after.madeAt).toBeTruthy()
  })

  it('respects edited amounts and accumulates madeCount across makes', async () => {
    const { vinyl } = await seed()
    const p = await project([{ supplyId: vinyl.id, amount: 1, unit: 'sheet' }])
    await applyMade(p.id, [{ supplyId: vinyl.id, name: 'Black vinyl', unit: 'sheet', available: 6, amount: 0.5, missing: false }], 1)
    await applyMade(p.id, proposeDeductions(p, await db.supplies.toArray(), 2), 2)
    expect((await db.supplies.get(vinyl.id))!.quantity).toBe(3.5)
    expect((await db.projects.get(p.id))!.madeCount).toBe(3)
  })

  it('links a made gift to the person so it is not suggested again', async () => {
    const { mugs } = await seed()
    const person = await savePerson({ name: 'Ms. Lee', interests: [] })
    const p = await project([{ supplyId: mugs.id, amount: 1, unit: 'blank' }], { personId: person.id })
    await applyMade(p.id, proposeDeductions(p, await db.supplies.toArray(), 1), 1)
    expect((await db.people.get(person.id))!.pastGiftProjectIds).toEqual([p.id])
  })

  it('handles a supply deleted after the project was saved', () => {
    const rows = proposeDeductions({ uses: [{ supplyId: 'gone', amount: 1, unit: 'sheet' }] }, [] as Supply[], 1)
    expect(rows[0].missing).toBe(true)
  })

  it('afterDeduction clamps and rounds', () => {
    expect(afterDeduction(1, 1.5)).toBe(0)
    expect(afterDeduction(0.3, 0.1)).toBe(0.2)
  })
})
