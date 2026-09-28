import { readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiResponseError, NoKeyError, getAiClient, setAiClientForTests } from '../../src/lib/ai/aiClient'
import { buildRecommendParams, recommend } from '../../src/lib/ai/recommend'
import { SEED_CATEGORIES } from '../../src/data/categories'
import { db } from '../../src/db'
import type { DecorRequest, Supply, UserSetup } from '../../src/types'

const supplies: Supply[] = JSON.parse(readFileSync('tests/fixtures/inventory-30.json', 'utf8'))
const setup: UserSetup = JSON.parse(readFileSync('tests/fixtures/setup-maker5-basic.json', 'utf8'))
const categories = new Map(SEED_CATEGORIES.map((c) => [c.id, c]))
const request: DecorRequest = { goal: 'decor', room: 'kitchen', onlyWhatIHave: true, maxDifficulty: 3, timeAvailable: 'an afternoon', count: 5 }
const recorded: Anthropic.Message = JSON.parse(readFileSync('tests/fixtures/recommend-decor.json', 'utf8'))

function textMessage(text: string): Anthropic.Message {
  return { ...recorded, content: [{ type: 'text', text, citations: null }] as Anthropic.Message['content'], stop_reason: 'end_turn' }
}

beforeEach(async () => {
  await db.usage.clear()
})
afterEach(() => setAiClientForTests(null))

describe('recommend()', () => {
  it('without a key, throws the friendly no-key error (never a raw failure)', async () => {
    await expect(getAiClient()).rejects.toBeInstanceOf(NoKeyError)
  })

  it('returns classified suggestions from a recorded response and logs usage', async () => {
    setAiClientForTests({ createMessage: async () => recorded })
    const out = await recommend({ setup, supplies, categories, request })
    expect(out.now.length + out.needs.length).toBe(5)
    const log = await db.usage.toArray()
    expect(log).toHaveLength(1)
    expect(log[0].feature).toBe('recommend')
    expect(log[0].outputTokens).toBeGreaterThan(0)
  })

  it('retries once when the answer does not match the schema, then succeeds', async () => {
    let calls = 0
    setAiClientForTests({
      createMessage: async () => {
        calls++
        return calls === 1 ? textMessage('{"oops": true}') : recorded
      },
    })
    const out = await recommend({ setup, supplies, categories, request })
    expect(calls).toBe(2)
    expect(out.now.length + out.needs.length).toBe(5)
  })

  it('gives up with a friendly error after two bad answers', async () => {
    let calls = 0
    setAiClientForTests({
      createMessage: async () => {
        calls++
        return textMessage('not json')
      },
    })
    await expect(recommend({ setup, supplies, categories, request })).rejects.toBeInstanceOf(AiResponseError)
    expect(calls).toBe(2)
  })

  it('does not retry a refusal', async () => {
    let calls = 0
    setAiClientForTests({
      createMessage: async () => {
        calls++
        return { ...recorded, stop_reason: 'refusal' } as Anthropic.Message
      },
    })
    await expect(recommend({ setup, supplies, categories, request })).rejects.toMatchObject({ kind: 'refused' })
    expect(calls).toBe(1)
  })
})

describe('buildRecommendParams()', () => {
  it('caches the stable machine/stash block and keeps the request after it', () => {
    const p = buildRecommendParams({ setup, supplies, categories, request })
    const system = p.system as Anthropic.TextBlockParam[]
    expect(system).toHaveLength(2)
    expect(system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(system[1].text).toContain('sup-01 | Glossy permanent vinyl')
    expect(system[1].text).toContain('fine-point-cutting-tool | Fine-point cutting tool (Maker 5 one-piece) | OWNED')
    expect(system[1].text).toContain('knife-blade | Knife blade | not owned')
    expect(JSON.stringify(p.messages)).toContain('ONLY USE WHAT I HAVE: yes')
  })

  it('uses the configured models and a structured-output schema', () => {
    expect(buildRecommendParams({ setup, supplies, categories, request }).model).toBe('claude-sonnet-5')
    const best = buildRecommendParams({ setup: { ...setup, quality: 'best' }, supplies, categories, request })
    expect(best.model).toBe('claude-opus-5')
    expect(best.output_config?.format?.type).toBe('json_schema')
  })

  it('the system prompt carries the non-negotiable rules', () => {
    const p = buildRecommendParams({ setup, supplies, categories, request })
    const rules = (p.system as Anthropic.TextBlockParam[])[0].text
    expect(rules).toMatch(/licensed characters, sports teams, brand logos/)
    expect(rules).toMatch(/only reference supplyId values/)
    expect(rules).toMatch(/Never require a machine tool the crafter doesn't own/)
  })
})
