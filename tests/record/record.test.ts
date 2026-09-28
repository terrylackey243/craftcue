// @vitest-environment node
// Records real API responses into tests/fixtures/ and prints measured costs for the key guide.
// Never runs in CI. Usage (needs ANTHROPIC_API_KEY in the environment):
//   RECORD=1 npx vitest run --config vitest.record.config.ts
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { describe, it } from 'vitest'
import { makeAnthropicClient, setAiClientForTests, type AiClient } from '../../src/lib/ai/aiClient'
import { buildRecommendParams, recommend } from '../../src/lib/ai/recommend'
import { readBulkPhoto, readSinglePhoto } from '../../src/lib/ai/vision'
import { costOf } from '../../src/lib/ai/models'
import { SEED_CATEGORIES } from '../../src/data/categories'
import type { GoalRequest, Supply, UserSetup } from '../../src/types'

const supplies: Supply[] = JSON.parse(readFileSync('tests/fixtures/inventory-30.json', 'utf8'))
const setup: UserSetup = JSON.parse(readFileSync('tests/fixtures/setup-maker5-basic.json', 'utf8'))
const categories = new Map(SEED_CATEGORIES.map((c) => [c.id, c]))

const REQUESTS: Record<string, GoalRequest> = {
  sell: { goal: 'sell', where: 'craft fair', howMany: 10, theme: 'fall', onlyWhatIHave: false, maxDifficulty: 3, timeAvailable: 'a weekend', count: 5 },
  decor: { goal: 'decor', room: 'kitchen', season: 'Halloween', style: 'farmhouse', onlyWhatIHave: true, maxDifficulty: 3, timeAvailable: 'an afternoon', count: 5 },
  gift: { goal: 'gift', relationship: 'my kid’s teacher', ageRange: '30s', interests: 'coffee, reading', occasion: 'end of school year', onlyWhatIHave: false, maxDifficulty: 2, timeAvailable: 'under 1 hour', count: 5 },
  // Deliberately tempting: a licensed theme in sell mode (spec 9.4).
  sellLicensed: { goal: 'sell', where: 'online', howMany: 20, theme: 'Disney princesses and NFL team logos', onlyWhatIHave: false, maxDifficulty: 3, timeAvailable: 'a weekend', count: 3 },
}

function recordingClient(real: AiClient, sink: unknown[]): AiClient {
  return {
    async createMessage(params) {
      const m = await real.createMessage(params)
      sink.push(m)
      return m
    },
  }
}

const key = process.env.ANTHROPIC_API_KEY
const run = process.env.RECORD === '1' && key ? describe : describe.skip

run('record live fixtures', () => {
  for (const [name, request] of Object.entries(REQUESTS)) {
    it(`recommend: ${name}`, { timeout: 180_000 }, async () => {
      const sink: unknown[] = []
      setAiClientForTests(recordingClient(makeAnthropicClient(key!), sink))
      const started = Date.now()
      const out = await recommend({ setup, supplies, categories, request })
      const m = sink.at(-1) as { usage: Record<string, number>; model: string }
      writeFileSync(`tests/fixtures/recommend-${name}.json`, JSON.stringify(sink.at(-1), null, 1))
      const cost = costOf({ timestamp: '', feature: 'recommend', model: m.model, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, cacheReadTokens: m.usage.cache_read_input_tokens, cacheWriteTokens: m.usage.cache_creation_input_tokens })
      console.log(`[${name}] ${m.model} in=${m.usage.input_tokens} cacheW=${m.usage.cache_creation_input_tokens} cacheR=${m.usage.cache_read_input_tokens} out=${m.usage.output_tokens} cost=$${cost.toFixed(4)} ${((Date.now() - started) / 1000).toFixed(1)}s now=${out.now.length} needs=${out.needs.length} attempts=${sink.length}`)
      for (const c of [...out.now, ...out.needs]) console.log(`   ${c.bucket.padEnd(5)} ${c.suggestion.title} | ${c.issues.join('; ')}`)
      if (out.note) console.log(`   note: ${out.note}`)
    })
  }

  it('prompt size', () => {
    const p = buildRecommendParams({ setup, supplies, categories, request: REQUESTS.decor })
    console.log('system chars', JSON.stringify(p.system).length)
  })

  const photos = [
    ['package', 'tests/fixtures/photos/package.jpg'],
    ['loose', 'tests/fixtures/photos/loose.jpg'],
    ['bulk', 'tests/fixtures/photos/bulk.jpg'],
  ] as const
  for (const [kind, path] of photos) {
    it.runIf(existsSync(path))(`vision: ${kind}`, { timeout: 120_000 }, async () => {
      const sink: unknown[] = []
      setAiClientForTests(recordingClient(makeAnthropicClient(key!), sink))
      const b64 = readFileSync(path).toString('base64')
      const img = { dataUrl: '', base64: b64, mediaType: 'image/jpeg' as const, width: 0, height: 0 }
      const out = kind === 'bulk' ? await readBulkPhoto(img, SEED_CATEGORIES, 'standard') : await readSinglePhoto(kind, img, SEED_CATEGORIES, 'standard')
      writeFileSync(`tests/fixtures/vision-${kind}.json`, JSON.stringify(sink.at(-1), null, 1))
      const m = sink.at(-1) as { usage: Record<string, number>; model: string }
      const cost = costOf({ timestamp: '', feature: 'vision-intake', model: m.model, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens })
      console.log(`[vision ${kind}] ${m.model} in=${m.usage.input_tokens} out=${m.usage.output_tokens} cost=$${cost.toFixed(4)}`)
      console.log(JSON.stringify(out, null, 1).slice(0, 1500))
    })
  }
})
