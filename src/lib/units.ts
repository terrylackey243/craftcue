// Unit handling for amounts. Length units convert; a roll converts to length when its size says
// how long it is ("12 in x 10 ft roll"); everything else must match exactly.
import type { Supply } from '../types'

const LENGTH_IN_FEET: Record<string, number> = { ft: 1, feet: 1, foot: 1, yd: 3, yard: 3, yards: 3, in: 1 / 12, inch: 1 / 12, inches: 1 / 12 }

export function normalizeUnit(u: string): string {
  const s = u.trim().toLowerCase().replace(/\.$/, '')
  if (s.endsWith('s') && !['feet', 'inches', 'yards', 'glass'].includes(s)) {
    const single = s.slice(0, -1)
    if (['sheet', 'roll', 'piece', 'pack', 'blank', 'bottle', 'yard'].includes(single)) return single
  }
  return s
}

/** Convert `amount` from `from` into `to`, or undefined when the units aren't comparable. */
export function convert(amount: number, from: string, to: string): number | undefined {
  const f = normalizeUnit(from)
  const t = normalizeUnit(to)
  if (f === t) return amount
  if (f in LENGTH_IN_FEET && t in LENGTH_IN_FEET) return (amount * LENGTH_IN_FEET[f]) / LENGTH_IN_FEET[t]
  return undefined
}

/** Length of one roll in feet, read from a size like "12 in x 10 ft roll" or "12 in x 5 yd". */
export function rollLengthFt(dimensions: string | undefined): number | undefined {
  if (!dimensions) return undefined
  const m = dimensions.toLowerCase().match(/x\s*(\d+(?:\.\d+)?)\s*(ft|feet|foot|yd|yds|yard|yards)\b/)
  if (!m) return undefined
  const n = Number(m[1])
  return m[2].startsWith('y') ? n * 3 : n
}

/** Convert an amount into the supply's own unit, using the roll length when needed. */
export function toSupplyUnit(amount: number, unit: string, supply: Pick<Supply, 'unit' | 'dimensions'>): number | undefined {
  const direct = convert(amount, unit, supply.unit)
  if (direct !== undefined) return direct
  const perRoll = rollLengthFt(supply.dimensions)
  if (!perRoll) return undefined
  const f = normalizeUnit(unit)
  if (supply.unit === 'roll' && f in LENGTH_IN_FEET) return convert(amount, unit, 'ft')! / perRoll
  if (f === 'roll' && supply.unit in LENGTH_IN_FEET) return convert(amount * perRoll, 'ft', supply.unit)
  return undefined
}

/** Reusable things that should never be deducted when a project is made. */
export function isReusable(supply: Pick<Supply, 'category' | 'name' | 'subtype'>): boolean {
  if (supply.category !== 'transfer-tape-mats') return false
  const text = `${supply.name} ${supply.subtype ?? ''}`.toLowerCase()
  return /\bmat\b|\bmats\b/.test(text)
}
