// A project found elsewhere, from a photo of the finished piece: Claude estimates the materials
// (matched to the crafter's stash), extras like tea lights or glue, and the time to make one.
import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import type { Quality, Supply } from '../../types'
import type { Compressed } from '../images'
import { AiResponseError, checkStop, firstText, getAiClient, logUsage } from './aiClient'
import { recommendModel, supportsEffort } from './models'
import { wire } from './schemas'

export const PhotoEstimateSchema = z.object({
  title: z.string().describe('a short plain name for the project'),
  summary: z.string().describe('one sentence describing it'),
  estMinutes: z.number().describe('minutes for an experienced crafter to cut, weed and assemble ONE, with the cut file ready'),
  colors: z
    .array(
      z.object({
        name: z.string().describe('plain color name as seen, e.g. "pumpkin orange"'),
        hex: z.string().describe('hex color like #f28c28'),
        sheets: z.number().describe('estimated sheets of the matched material for ONE finished piece (whole sheets)'),
        supplyId: z.string().describe('id of the closest stash material, or "" if nothing in the stash is close'),
        usedFor: z.string().describe('what this color is used for, e.g. "hats and flames"'),
      }),
    )
    .describe('one entry per cut material color, biggest first'),
  extras: z
    .array(
      z.object({
        item: z.string().describe('e.g. "battery tea light", "glue", "foam adhesive squares"'),
        supplyId: z.string().describe('stash id if the stash has it, else ""'),
        amount: z.number(),
        unit: z.string().describe('the stash item\'s unit when matched, else e.g. "piece"'),
        estCost: z.string().describe('if not in the stash, a rough US price like "$0.40", else ""'),
      }),
    )
    .describe('non-cut things it needs'),
  notes: z.string().describe('anything the crafter should double-check, in one or two short sentences'),
})
export type PhotoEstimate = z.infer<typeof PhotoEstimateSchema>

const PROMPT = `This is a photo of a finished craft project made with a cutting machine (paper, cardstock, vinyl…) that the crafter found online or made from someone else's cut file. Estimate what ONE costs them to make from their own stash.

- List each material color you can see. Match each to the closest material in the STASH list (by color and type) and estimate how many whole sheets of that material one piece uses: add up the visible pieces of that color (including layers hidden behind others: layered paper designs usually have a full backing piece behind each part), allow for cutting gaps, and round up.
- Judge sizes from the photo (furniture, boxes, a tea light is about 1.5 in across). Say in notes what you assumed.
- List the extras it needs (tea lights, glue, foam squares, ribbon…). Use stash items when they are listed. Amounts are for ONE piece in the stash item's unit: glue is a small fraction of a bottle or stick (about 0.03 to 0.1), tape a few inches. Don't list pens, markers or tools: they aren't used up by one piece.
- Thin parts that look like sticks or poles in a paper piece are usually cardstock too. Prefer materials the crafter still has some of.
- Only use ids from the STASH list, or "" when nothing is close. Never invent ids.
- estMinutes: realistic time for ONE, including cutting several colors, weeding and gluing layers.`

function stashList(supplies: Supply[]): string {
  return supplies
    .filter((s) => s.quantity > 0 || s.unitCost !== undefined)
    .slice(0, 250)
    .map((s) => `${s.id} | ${s.name}${s.color ? ` — ${s.color}` : ''} | ${s.category} | ${s.dimensions || 'size unknown'} | unit ${s.unit}`)
    .join('\n')
}

export async function estimateFromPhoto(image: Compressed, supplies: Supply[], quality: Quality): Promise<PhotoEstimate> {
  const client = await getAiClient()
  const model = recommendModel(quality)
  const format = zodOutputFormat(PhotoEstimateSchema)
  const params = {
    model,
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: `${PROMPT}\n\nSTASH (id | name — color | type | size | unit):\n${stashList(supplies)}` },
        ],
      },
    ],
    output_config: { format: wire(format), ...(supportsEffort(model) ? { effort: 'medium' } : {}) },
  } as Anthropic.MessageCreateParamsNonStreaming
  const ids = new Set(supplies.map((s) => s.id))
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.createMessage(params)
    await logUsage('vision-intake', message)
    try {
      checkStop(message)
      const out = format.parse(firstText(message)) as PhotoEstimate
      // Drop any id that isn't really in the stash.
      for (const c of out.colors) if (!ids.has(c.supplyId)) c.supplyId = ''
      for (const x of out.extras) if (!ids.has(x.supplyId)) x.supplyId = ''
      // Pens, markers and tools aren't used up by one piece, whatever the model says.
      const byId = new Map(supplies.map((s) => [s.id, s]))
      out.extras = out.extras.filter((x) => byId.get(x.supplyId)?.category !== 'paint-markers' && !/\b(pen|pens|marker|markers)\b/i.test(x.item))
      return out
    } catch (e) {
      if (e instanceof AiResponseError && e.kind === 'refused') throw e
      if (!(e instanceof AnthropicError) && !(e instanceof AiResponseError)) throw e
    }
  }
  throw new AiResponseError('bad-response', "Couldn't read that photo. Try a clearer photo of the whole piece.")
}
