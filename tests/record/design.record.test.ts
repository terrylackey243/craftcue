// @vitest-environment node
// Live design runs (spends a few cents). RECORD=1 npx vitest run --config vitest.record.config.ts design
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { makeAnthropicClient, setAiClientForTests, type AiClient } from '../../src/lib/ai/aiClient'
import { designProject } from '../../src/lib/ai/design'
import { setFontLoader } from '../../src/lib/design/fonts'
import { exportSvg } from '../../src/lib/design/export'
import { costOf } from '../../src/lib/ai/models'
import { SEED_CATEGORIES } from '../../src/data/categories'
import type { Project, Supply, UserSetup } from '../../src/types'

setFontLoader(async (file) => {
  const b = readFileSync(`public/fonts/${file}`)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
})
const setup: UserSetup = JSON.parse(readFileSync('tests/fixtures/setup-maker5-basic.json', 'utf8'))
const inventory: Supply[] = JSON.parse(readFileSync('tests/fixtures/inventory-30.json', 'utf8'))
const categories = new Map(SEED_CATEGORIES.map((c) => [c.id, c]))
const astro = (id: string, color: string): Supply => ({ id, name: 'Astrobrights cardstock', color, category: 'cardstock-paper', subtype: '65 lb', dimensions: '8.5 x 11 in', quantity: 3, unit: 'sheet', setName: 'Astrobrights Spectrum assortment', source: 'manual', createdAt: '', updatedAt: '' })
const botanicalStash = [astro('terra', 'Terra Green'), astro('gamma', 'Gamma Green'), astro('husk', 'Husk'), astro('white', 'Solar White'), astro('red', 'Rocket Red'), astro('yellow', 'Solar Yellow')]

const project = (over: Partial<Project>): Project => ({ id: 'p', title: '', summary: '', goal: 'decor', goalContext: {}, status: 'idea', uses: [], missing: [], toolsNeeded: [], equipmentNeeded: [], steps: [], designTips: '', safetyNotes: [], aiGenerated: true, createdAt: '', updatedAt: '', ...over })

const decor = JSON.parse(readFileSync('tests/fixtures/recommend-decor.json', 'utf8'))
const sign = JSON.parse(decor.content.find((b: { type: string }) => b.type === 'text').text).suggestions[0]

const CASES: [string, Project, Supply[]][] = [
  [
    'botanical',
    project({
      title: 'Layered Paper Botanical Wall Art',
      summary: 'A dimensional paper art piece with layered leaves and a stem, like a pressed-botanical print but with paper depth. For an 8x10 frame.',
      steps: ['Design a simple branch with several leaf shapes', 'Size it to fit inside the frame opening', 'Cut leaves from the green cardstock, a stem from the brown, and a background from white', 'Score a vein down each leaf', 'Glue leaves on, some raised on foam squares', 'Frame it'],
      uses: [{ supplyId: 'terra', amount: 1, unit: 'sheet' }, { supplyId: 'gamma', amount: 1, unit: 'sheet' }, { supplyId: 'husk', amount: 1, unit: 'sheet' }, { supplyId: 'white', amount: 1, unit: 'sheet' }],
    }),
    botanicalStash,
  ],
  ['sign', project({ title: sign.title, summary: sign.summary, steps: sign.steps, designTips: sign.designTips, uses: sign.uses }), inventory],
]

function recorder(real: AiClient, sink: unknown[]): AiClient {
  return { async createMessage(p) { const m = await real.createMessage(p); sink.push(m); return m } }
}

const run = process.env.RECORD === '1' && process.env.ANTHROPIC_API_KEY ? describe : describe.skip
run('live designs', () => {
  for (const [name, p, supplies] of CASES) {
    it(name, { timeout: 300_000 }, async () => {
      const sink: { usage: Record<string, number>; model: string }[] = []
      setAiClientForTests(recorder(makeAnthropicClient(process.env.ANTHROPIC_API_KEY!), sink as never))
      const t = Date.now()
      const r = await designProject({ project: p, supplies, categories, setup })
      writeFileSync(`tests/fixtures/design-${name}.json`, JSON.stringify(sink.at(-1), null, 1))
      mkdirSync('.design-preview', { recursive: true })
      writeFileSync(`.design-preview/live-${name}.svg`, exportSvg(r.rendered, r.design.title))
      writeFileSync(`.design-preview/live-${name}.json`, JSON.stringify(r.design, null, 1))
      const cost = sink.reduce((n, m) => n + costOf({ timestamp: '', feature: 'design', model: m.model, inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, cacheReadTokens: m.usage.cache_read_input_tokens, cacheWriteTokens: m.usage.cache_creation_input_tokens }), 0)
      console.log(`[${name}] calls=${sink.length} cost=$${cost.toFixed(4)} ${((Date.now() - t) / 1000).toFixed(0)}s ${r.design.widthIn}x${r.design.heightIn} ${r.design.product} layers=${r.design.layers.map((l) => l.name).join(', ')}`)
      console.log(`   problems: ${JSON.stringify(r.check.problems)} cautions: ${JSON.stringify(r.check.cautions)}`)
    })
  }
})
