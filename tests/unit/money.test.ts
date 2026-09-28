import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoney, perUnitFromPack } from '../../src/lib/money'

describe('pack pricing', () => {
  it('works out the per-piece cost from the pack', () => {
    expect(perUnitFromPack(1.26, 80)).toBeCloseTo(0.01575, 8)
    expect(perUnitFromPack(10, 4)).toBe(2.5)
    expect(perUnitFromPack(0, 10)).toBe(0)
    expect(perUnitFromPack(1.26, 0)).toBeUndefined()
    expect(perUnitFromPack(undefined, 80)).toBeUndefined()
  })

  it('shows tiny costs without rounding them away', () => {
    expect(formatMoney(0.01575)).toBe('$0.0158')
    expect(formatMoney(0.042)).toBe('$0.042')
    expect(formatMoney(0.25)).toBe('$0.25')
    expect(formatMoney(1.26)).toBe('$1.26')
    expect(formatMoney(12.5)).toBe('$12.50')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(undefined)).toBe('')
  })

  it('reads money the way people type it', () => {
    expect(parseMoney('$1.26')).toBe(1.26)
    expect(parseMoney(' 1,26 ')).toBe(1.26)
    expect(parseMoney('')).toBeUndefined()
    expect(parseMoney('abc')).toBeUndefined()
    expect(parseMoney('-3')).toBeUndefined()
  })
})
