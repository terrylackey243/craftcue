import { afterEach, describe, expect, it } from 'vitest'
import { setAiClientForTests } from '../../src/lib/ai/aiClient'
import { estimateFromPhoto, type PhotoEstimate } from '../../src/lib/ai/importPhoto'
import type { Supply } from '../../src/types'

afterEach(() => setAiClientForTests(null))

const stash = [
  { id: 'wht', name: 'Cardstock', color: 'White', category: 'cardstock-paper', quantity: 3, unit: 'sheet' },
  { id: 'pen', name: 'Fine Point Pens', color: 'Black', category: 'paint-markers', quantity: 1, unit: 'piece' },
  { id: 'glue', name: 'Glue', color: 'clear', category: 'adhesives-glue', quantity: 1, unit: 'bottle' },
] as Supply[]

const reply = (out: PhotoEstimate) => ({
  id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(out) }],
  usage: { input_tokens: 100, output_tokens: 100 },
})

describe('estimating an outside project from a photo', () => {
  it('keeps only real stash ids and drops pens and markers', async () => {
    setAiClientForTests({
      createMessage: async () =>
        reply({
          title: 'Ghosts', summary: 'Ghosts by a fire', estMinutes: 75, notes: '',
          colors: [{ name: 'white', hex: '#ffffff', sheets: 2, supplyId: 'wht', usedFor: 'ghosts' }, { name: 'teal', hex: '#00aaaa', sheets: 1, supplyId: 'made-up', usedFor: 'x' }],
          extras: [
            { item: 'glue', supplyId: 'glue', amount: 0.05, unit: 'bottle', estCost: '' },
            { item: 'black pen for details', supplyId: 'pen', amount: 1, unit: 'piece', estCost: '' },
            { item: 'tea light', supplyId: '', amount: 1, unit: 'piece', estCost: '$0.40' },
          ],
        }) as never,
    })
    const est = await estimateFromPhoto({ dataUrl: '', base64: 'x', mediaType: 'image/jpeg', width: 1, height: 1 }, stash, 'standard')
    expect(est.colors.map((c) => c.supplyId)).toEqual(['wht', ''])
    expect(est.extras.map((x) => x.item)).toEqual(['glue', 'tea light'])
  })
})
