// App-side checks on every suggestion (spec 9.5). The model is asked to follow the rules; this
// makes sure a suggestion can only land in "Make it now" if it really can be made right now.
import { getTool } from '../../data'
import { EQUIPMENT, type MissingItem, type Supply, type SupplyUse, type UserSetup } from '../../types'
import { isReusable, toSupplyUnit } from '../units'
import type { RawSuggestion } from './schemas'
import { stashMatchFor } from '../colorMatch'

export type Bucket = 'now' | 'needs'

export interface CheckedSuggestion {
  suggestion: Omit<RawSuggestion, 'uses' | 'missing'> & { uses: SupplyUse[]; missing: MissingItem[] }
  bucket: Bucket
  /** Plain-language reasons it isn't "make it now", shown on the card. */
  issues: string[]
  /** Softer notes that don't change the bucket (e.g. an amount we couldn't check). */
  warnings: string[]
}

const equipmentName = (id: string) => EQUIPMENT.find((e) => e.id === id)?.name ?? id

export function checkSuggestion(raw: RawSuggestion, supplies: Supply[], setup: UserSetup, batch = 1): CheckedSuggestion {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const issues: string[] = []
  const warnings: string[] = []
  const uses: SupplyUse[] = []
  // A "missing" color the stash has under another name ("brown cardstock" → Dirt) is on hand.
  const missing: MissingItem[] = []
  let stillMissing = 0
  for (const m of raw.missing) {
    const have = /^more\b/i.test(m.item) ? null : stashMatchFor(m.item, supplies)
    if (!have || uses.some((u) => u.supplyId === have.id) || raw.uses.some((u) => u.supplyId === have.id)) {
      missing.push(m)
      stillMissing++
      continue
    }
    const unit = ['in', 'ft', 'yd', 'roll'].includes(have.unit) ? 'in' : have.unit
    uses.push({ supplyId: have.id, amount: unit === 'in' ? 12 : 1, unit })
    warnings.push(`${m.item} → you have ${[have.color, have.name].filter(Boolean).join(' ')} (close match). Check how much it needs.`)
  }

  // 1. Supplies must exist. Unknown ids are dropped and recorded as a missing item.
  for (const u of raw.uses) {
    if (!byId.has(u.supplyId)) {
      missing.push({ item: 'A supply that is not in your stash', why: `The idea referred to something (${u.unit}) we couldn't find in your inventory.`, estCost: '' })
      issues.push('Uses a supply that isn’t in your stash')
      continue
    }
    if (!(u.amount > 0)) continue
    // Cutting mats get reused, so they're never "used up" by a project.
    if (isReusable(byId.get(u.supplyId)!)) continue
    uses.push({ supplyId: u.supplyId, amount: u.amount, unit: u.unit })
  }

  // 2. Amounts: total needed (per item × batch, summed per supply) must fit what's on hand.
  const need = new Map<string, number>()
  for (const u of uses) {
    const s = byId.get(u.supplyId)!
    const inSupplyUnit = toSupplyUnit(u.amount, u.unit, s)
    if (inSupplyUnit === undefined) {
      warnings.push(`Check the amount of ${s.name}: the idea uses ${u.unit}, your stash counts ${s.unit}.`)
      continue
    }
    need.set(s.id, (need.get(s.id) ?? 0) + inSupplyUnit * batch)
  }
  for (const [id, total] of need) {
    const s = byId.get(id)!
    if (total > s.quantity + 1e-9) {
      const short = Math.round((total - s.quantity) * 100) / 100
      missing.push({ item: `More ${s.name}`, why: `Needs about ${round(total)} ${s.unit}, you have ${round(s.quantity)}.`, estCost: '' })
      issues.push(`Not enough ${s.name} (short by ${short} ${s.unit})`)
    }
  }

  // 3. Tools must be owned.
  const owned = new Set(setup.ownedToolIds)
  for (const t of raw.toolsNeeded) {
    if (!owned.has(t)) {
      const name = getTool(t)?.name ?? t
      if (!missing.some((m) => m.item === name)) missing.push({ item: name, why: 'A machine tool this project needs.', estCost: '' })
      issues.push(`Needs a tool you don't have: ${name}`)
    }
  }

  // 4. Equipment must be owned.
  const eq = new Set(setup.equipment)
  for (const e of raw.equipmentNeeded) {
    if (!eq.has(e)) {
      const name = equipmentName(e)
      if (!missing.some((m) => m.item === name)) missing.push({ item: name, why: 'Equipment this project needs.', estCost: '' })
      issues.push(`Needs equipment you don't have: ${name}`)
    }
  }

  if (stillMissing) issues.push(`Needs ${stillMissing} thing${stillMissing === 1 ? '' : 's'} you don't have`)

  const bucket: Bucket = missing.length === 0 && issues.length === 0 ? 'now' : 'needs'
  return { suggestion: { ...raw, uses, missing }, bucket, issues: dedupe(issues), warnings: dedupe(warnings) }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

function dedupe(a: string[]) {
  return [...new Set(a)]
}

export function classify(raws: RawSuggestion[], supplies: Supply[], setup: UserSetup, batch = 1) {
  const checked = raws.map((r) => checkSuggestion(r, supplies, setup, batch))
  return { now: checked.filter((c) => c.bucket === 'now'), needs: checked.filter((c) => c.bucket === 'needs') }
}
