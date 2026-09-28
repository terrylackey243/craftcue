import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkSuggestion, classify } from '../../src/lib/ai/validate'
import { parseRecommendations } from '../../src/lib/ai/recommend'
import { getTool } from '../../src/data'
import type { RawSuggestion } from '../../src/lib/ai/schemas'
import type { Supply, UserSetup } from '../../src/types'

const supplies: Supply[] = JSON.parse(readFileSync('tests/fixtures/inventory-30.json', 'utf8'))
const setup: UserSetup = JSON.parse(readFileSync('tests/fixtures/setup-maker5-basic.json', 'utf8'))
const byId = new Map(supplies.map((s) => [s.id, s]))

function suggestion(over: Partial<RawSuggestion>): RawSuggestion {
  return {
    title: 'Test',
    summary: '',
    whyItFits: '',
    difficulty: 1,
    estMinutes: 30,
    uses: [],
    missing: [],
    toolsNeeded: ['fine-point-cutting-tool'],
    equipmentNeeded: [],
    steps: [],
    designTips: '',
    sellInfo: null,
    safetyNotes: [],
    ...over,
  }
}

/** The acceptance rule (spec Phase 2): nothing in "Make it now" may need an unowned tool or a missing/short supply. */
function assertMakeNowIsHonest(now: ReturnType<typeof classify>['now'], batch: number) {
  for (const c of now) {
    const s = c.suggestion
    expect(s.missing, s.title).toEqual([])
    for (const t of s.toolsNeeded) expect(setup.ownedToolIds, `${s.title} needs ${t}`).toContain(t)
    for (const e of s.equipmentNeeded) expect(setup.equipment, `${s.title} needs ${e}`).toContain(e)
    const totals = new Map<string, number>()
    for (const u of s.uses) {
      expect(byId.has(u.supplyId), `${s.title} uses unknown ${u.supplyId}`).toBe(true)
      totals.set(u.supplyId, (totals.get(u.supplyId) ?? 0) + u.amount * batch)
    }
    for (const [id, total] of totals) {
      const supply = byId.get(id)!
      if (supply.unit === s.uses.find((u) => u.supplyId === id)!.unit) expect(total, `${s.title}: ${supply.name}`).toBeLessThanOrEqual(supply.quantity)
    }
  }
}

describe('recorded live responses (Maker 5 + fine point + scoring only)', () => {
  const files = readdirSync('tests/fixtures').filter((f) => f.startsWith('recommend-') && f.endsWith('.json'))

  it('has recorded fixtures to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  for (const f of files) {
    it(`${f}: every "Make it now" idea is really makeable`, () => {
      const message = JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
      const text = message.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
      const parsed = parseRecommendations(text)
      const batch = f.includes('sell') ? (f.includes('Licensed') ? 20 : 10) : 1
      const { now, needs } = classify(parsed.suggestions, supplies, setup, batch)
      expect(now.length + needs.length).toBe(parsed.suggestions.length)
      assertMakeNowIsHonest(now, batch)
      for (const c of needs) expect(c.issues.length + c.suggestion.missing.length).toBeGreaterThan(0)
    })
  }
})

describe('adversarial suggestions', () => {
  it('moves an unowned tool to "needs" and lists it as missing', () => {
    const c = checkSuggestion(suggestion({ toolsNeeded: ['fine-point-cutting-tool', 'knife-blade'], uses: [{ supplyId: 'sup-24', amount: 1, unit: 'sheet' }] }), supplies, setup)
    expect(c.bucket).toBe('needs')
    expect(c.suggestion.missing.map((m) => m.item)).toContain(getTool('knife-blade')!.name)
  })

  it('drops an invented supplyId and records a missing item', () => {
    const c = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-999', amount: 1, unit: 'sheet' }] }), supplies, setup)
    expect(c.bucket).toBe('needs')
    expect(c.suggestion.uses).toEqual([])
    expect(c.suggestion.missing).toHaveLength(1)
  })

  it('flags quantities beyond what is on hand, per item × batch', () => {
    // 4 mugs on hand; one mug each; a batch of 10 is 6 short.
    const one = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-15', amount: 1, unit: 'blank' }] }), supplies, setup, 1)
    expect(one.bucket).toBe('now')
    const ten = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-15', amount: 1, unit: 'blank' }] }), supplies, setup, 10)
    expect(ten.bucket).toBe('needs')
    expect(ten.issues.join()).toMatch(/short by 6/)
  })

  it('sums repeated uses of the same supply', () => {
    const c = checkSuggestion(
      suggestion({ uses: [{ supplyId: 'sup-05', amount: 1.5, unit: 'sheet' }, { supplyId: 'sup-05', amount: 1, unit: 'sheet' }] }),
      supplies,
      setup,
    )
    expect(c.bucket).toBe('needs') // 2.5 > 2 gold glitter sheets
  })

  it('flags unowned equipment', () => {
    const c = checkSuggestion(suggestion({ equipmentNeeded: ['heat-press'] }), supplies, setup)
    expect(c.bucket).toBe('needs')
  })

  it('keeps model-declared missing items in "needs"', () => {
    const c = checkSuggestion(suggestion({ missing: [{ item: 'Wood slices', why: 'base', estCost: '$8' }] }), supplies, setup)
    expect(c.bucket).toBe('needs')
  })

  it('converts feet of transfer tape against a roll with a known length', () => {
    // 1 roll of 12 in x 10 ft transfer tape on hand.
    const ok = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-25', amount: 2, unit: 'ft' }] }), supplies, setup, 4)
    expect(ok.bucket).toBe('now')
    expect(ok.warnings).toEqual([])
    const short = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-25', amount: 2, unit: 'ft' }] }), supplies, setup, 6)
    expect(short.bucket).toBe('needs')
  })

  it('never deducts or counts a cutting mat', () => {
    const c = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-26', amount: 5, unit: 'piece' }] }), supplies, setup)
    expect(c.suggestion.uses).toEqual([])
    expect(c.bucket).toBe('now')
  })

  it('warns (without blocking) when units cannot be compared', () => {
    const c = checkSuggestion(suggestion({ uses: [{ supplyId: 'sup-27', amount: 2, unit: 'piece' }] }), supplies, setup)
    expect(c.warnings.length).toBe(1)
  })
})
