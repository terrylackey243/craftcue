// "Mark as made" (spec 9.6): propose deductions from the project's uses, let the user edit them,
// then apply everything in one transaction.
import { db, noteChange } from '../db'
import type { Project, Supply } from '../types'
import { nowIso } from './ids'
import { roundQty } from './repo'
import { isReusable, toSupplyUnit } from './units'

export interface DeductionRow {
  supplyId: string
  name: string
  unit: string // the supply's unit
  available: number
  amount: number // total to deduct, in the supply's unit
  missing: boolean // supply was deleted since the project was saved
}

/** `uses` are per finished item; multiply by how many were made. */
export function proposeDeductions(project: Pick<Project, 'uses'>, supplies: Supply[], madeCount: number): DeductionRow[] {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const rows = new Map<string, DeductionRow>()
  for (const u of project.uses) {
    const s = byId.get(u.supplyId)
    if (!s) {
      rows.set(u.supplyId, { supplyId: u.supplyId, name: '(no longer in your stash)', unit: u.unit, available: 0, amount: 0, missing: true })
      continue
    }
    if (isReusable(s)) continue
    const perItem = toSupplyUnit(u.amount, u.unit, s) ?? u.amount
    const prev = rows.get(s.id)
    const amount = roundQty((prev?.amount ?? 0) + perItem * madeCount)
    rows.set(s.id, { supplyId: s.id, name: s.name, unit: s.unit, available: s.quantity, amount, missing: false })
  }
  return [...rows.values()]
}

export function afterDeduction(available: number, amount: number): number {
  return Math.max(0, roundQty(available - Math.max(0, amount)))
}

export async function applyMade(projectId: string, rows: DeductionRow[], madeCount: number): Promise<void> {
  await db.transaction('rw', db.supplies, db.projects, db.people, async () => {
    const project = await db.projects.get(projectId)
    if (!project) throw new Error('Project not found')
    const t = nowIso()
    for (const r of rows) {
      if (r.missing || !(r.amount > 0)) continue
      const s = await db.supplies.get(r.supplyId)
      if (!s) continue
      await db.supplies.update(s.id, { quantity: afterDeduction(s.quantity, r.amount), updatedAt: t })
    }
    await db.projects.update(projectId, {
      status: 'made',
      madeAt: t,
      madeCount: (project.madeCount ?? 0) + madeCount,
      updatedAt: t,
    })
    if (project.goal === 'gift' && project.personId) {
      const person = await db.people.get(project.personId)
      if (person && !person.pastGiftProjectIds.includes(projectId)) {
        await db.people.update(person.id, { pastGiftProjectIds: [...person.pastGiftProjectIds, projectId], updatedAt: t })
      }
    }
  })
  await noteChange()
}
