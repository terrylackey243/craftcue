// @vitest-environment node
// Live photo estimate on Terry's finished piece + stash (local-only files; skipped without them).
// RECORD=1 npx vitest run --config vitest.record.config.ts importPhoto
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { makeAnthropicClient, setAiClientForTests } from '../../src/lib/ai/aiClient'
import { estimateFromPhoto } from '../../src/lib/ai/importPhoto'
import type { Supply } from '../../src/types'

const PHOTO = 'tests/fixtures/photos/campfire-local.jpg'
const STASH = 'tests/fixtures/project-coffee-ptc.json'
const run = process.env.RECORD === '1' && process.env.ANTHROPIC_API_KEY && existsSync(PHOTO) && existsSync(STASH) ? describe : describe.skip
run('live photo estimate', () => {
  it('campfire ghosts', { timeout: 300_000 }, async () => {
    setAiClientForTests(makeAnthropicClient(process.env.ANTHROPIC_API_KEY!))
    const supplies: Supply[] = JSON.parse(readFileSync(STASH, 'utf8')).supplies
    const b64 = readFileSync(PHOTO).toString('base64')
    const t = Date.now()
    const est = await estimateFromPhoto({ dataUrl: '', base64: b64, mediaType: 'image/jpeg', width: 0, height: 0 }, supplies, 'standard')
    const name = (id: string) => supplies.find((s) => s.id === id)
    console.log(`${((Date.now() - t) / 1000).toFixed(0)}s`, est.title, '|', est.estMinutes, 'min')
    for (const c of est.colors) console.log(`  ${c.name} (${c.usedFor}) ${c.sheets} sheets → ${c.supplyId ? `${name(c.supplyId)?.color} ${name(c.supplyId)?.name} ${name(c.supplyId)?.dimensions}` : 'NOT IN STASH'}`)
    for (const x of est.extras) console.log(`  + ${x.item} ${x.amount} ${x.unit} ${x.supplyId ? `(stash: ${name(x.supplyId)?.name})` : x.estCost}`)
    console.log('  notes:', est.notes)
  })
})
