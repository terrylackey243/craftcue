import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Category, Quality, Supply } from '../../types'
import type { Compressed } from '../images'
import { AiResponseError, checkStop, firstText, getAiClient, logUsage } from './aiClient'
import { supportsEffort, visionModel } from './models'
import { visionBulkSchema, visionSingleSchema, wire, type VisionItem } from './schemas'

export type PhotoKind = 'package' | 'loose' | 'bulk'

export type Confidence = 'high' | 'medium' | 'low'

/** A proposed supply plus the fields the user should double-check (spec 8: "uncertain fields are highlighted"). */
export interface ProposedSupply {
  supply: Partial<Supply>
  uncertain: Partial<Record<keyof Supply, string>>
}

const COMMON = `Fill in every field. Use an empty string for text you can't tell. Give your confidence for each listed field honestly: "low" if you are guessing.
Use the category id that fits best from the list. Units: sheet, roll, ft, yd, piece, pack, blank, bottle, other.
Colors in plain words ("pastel pink", "matte black"). Dimensions like "12 x 12 in", "12 in x 10 ft roll", "11 oz mug".`

const PROMPTS: Record<PhotoKind, string> = {
  package: `This is a photo of a craft supply package (for a cutting machine crafter). Read the label and describe the product as one inventory item.
Quantity is the number of units in the package (e.g. a 6-sheet pack is quantity 6, unit "sheet"; a single roll is quantity 1, unit "roll").
If you can read barcode (UPC/EAN) digits printed on the package, put them in upcDigits.
${COMMON}`,
  loose: `This is a photo of a single loose craft supply with no package or label. Describe it as one inventory item: what it is, category, color, finish, and rough size.
You cannot know the exact quantity or length from a photo, so estimate and mark quantity and dimensions confidence as "low". Leave brand empty unless it is printed on the item. upcDigits is an empty string.
${COMMON}`,
  bulk: `This is a photo of a crafter's shelf, bin or pile of supplies. List each distinct supply you can see as its own inventory item (group identical items into one line with a quantity).
Include only craft supplies and blanks, not furniture or tools. If there are more than 40, list the 40 clearest. Mark anything you are unsure about as "low" confidence.
${COMMON}`,
}

function categoryList(categories: Category[]): string {
  return categories.map((c) => `${c.id}: ${c.name}`).join('\n')
}

function toProposed(item: VisionItem, source: Supply['source'], upc?: string): ProposedSupply {
  const uncertain: ProposedSupply['uncertain'] = {}
  const flag = (field: keyof Supply, c: Confidence, msg = 'Please check this') => {
    if (c !== 'high') uncertain[field] = msg
  }
  flag('name', item.confidence.name)
  flag('category', item.confidence.category)
  if (item.brand) flag('brand', item.confidence.brand)
  if (item.color) flag('color', item.confidence.color)
  flag('dimensions', item.confidence.dimensions, 'Please check the size')
  flag('quantity', item.confidence.quantity, 'Please check how many you have')
  return {
    supply: {
      name: item.name,
      category: item.category,
      subtype: item.subtype || undefined,
      brand: item.brand || undefined,
      color: item.color || undefined,
      finish: item.finish || undefined,
      dimensions: item.dimensions || undefined,
      quantity: item.quantity > 0 ? item.quantity : 1,
      unit: item.unit,
      adhesive: item.adhesive === 'unknown' ? undefined : item.adhesive,
      upc,
      source,
    },
    uncertain,
  }
}

async function callVision<T>(format: ReturnType<typeof zodOutputFormat>, prompt: string, image: Compressed, quality: Quality, maxTokens: number): Promise<T> {
  const client = await getAiClient()
  const model = visionModel(quality)
  const params = {
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    output_config: { format: wire(format), ...(supportsEffort(model) ? { effort: 'low' } : {}) },
  } as Anthropic.MessageCreateParamsNonStreaming
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.createMessage(params)
    await logUsage('vision-intake', message)
    try {
      checkStop(message)
      return format.parse(firstText(message)) as T
    } catch (e) {
      lastError = e
      if (e instanceof AiResponseError && e.kind === 'refused') throw e
      if (!(e instanceof AnthropicError) && !(e instanceof AiResponseError)) throw e
    }
  }
  void lastError
  throw new AiResponseError('bad-response', "Couldn't read that photo. Try again with the label facing the camera in good light.")
}

export async function readSinglePhoto(kind: 'package' | 'loose', image: Compressed, categories: Category[], quality: Quality, knownUpc?: string): Promise<ProposedSupply & { upcDigits: string }> {
  const format = zodOutputFormat(visionSingleSchema(categories.map((c) => c.id)))
  const prompt = `${PROMPTS[kind]}\n\nCategories:\n${categoryList(categories)}${knownUpc ? `\n\nThe crafter already scanned barcode ${knownUpc}.` : ''}`
  const out = await callVision<{ item: VisionItem; upcDigits: string }>(format, prompt, image, quality, 2000)
  const upc = knownUpc ?? (out.upcDigits.replace(/\D/g, '') || undefined)
  return { ...toProposed(out.item, 'vision', upc), upcDigits: out.upcDigits }
}

export async function readBulkPhoto(image: Compressed, categories: Category[], quality: Quality): Promise<ProposedSupply[]> {
  const format = zodOutputFormat(visionBulkSchema(categories.map((c) => c.id)))
  const prompt = `${PROMPTS.bulk}\n\nCategories:\n${categoryList(categories)}`
  const out = await callVision<{ items: VisionItem[] }>(format, prompt, image, quality, 8000)
  return out.items.map((i) => toProposed(i, 'vision'))
}
