import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { TOOLS } from '../../data'
import { EQUIPMENT, UNITS } from '../../types'

// ----- Recommendations (spec 9.3) -----

const TOOL_IDS = TOOLS.map((t) => t.id) as [string, ...string[]]
const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id) as unknown as [string, ...string[]]

export const SuggestionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  whyItFits: z.string(),
  difficulty: z.number().describe('1 (very easy) to 5 (advanced)'),
  estMinutes: z.number(),
  uses: z.array(
    z.object({
      supplyId: z.string().describe('Exact id from the inventory list'),
      amount: z.number().describe('Amount for ONE finished item, in the supply unit'),
      unit: z.string(),
    }),
  ),
  missing: z.array(z.object({ item: z.string(), why: z.string(), estCost: z.string() })),
  toolsNeeded: z.array(z.enum(TOOL_IDS)),
  equipmentNeeded: z.array(z.enum(EQUIPMENT_IDS)),
  steps: z.array(z.string()),
  designTips: z.string(),
  sellInfo: z.object({ unitCostEst: z.string(), priceLow: z.string(), priceHigh: z.string(), batchNotes: z.string() }).nullable(),
  safetyNotes: z.array(z.string()),
})

export const RecommendationsSchema = z.object({
  suggestions: z.array(SuggestionSchema),
  note: z.string().describe('Optional short message to the crafter, e.g. why a requested theme was avoided. Empty string if none.'),
})

export type RawSuggestion = z.infer<typeof SuggestionSchema>
export type RawRecommendations = z.infer<typeof RecommendationsSchema>

export const recommendationsFormat = zodOutputFormat(RecommendationsSchema)

// ----- Vision intake (spec 8.2–8.4) -----

const Confidence = z.enum(['high', 'medium', 'low'])

export function visionItemSchema(categoryIds: string[]) {
  return z.object({
    name: z.string(),
    category: z.enum(categoryIds as [string, ...string[]]),
    subtype: z.string(),
    brand: z.string(),
    color: z.string(),
    finish: z.string(),
    dimensions: z.string(),
    quantity: z.number(),
    unit: z.enum(UNITS),
    adhesive: z.enum(['none', 'removable', 'permanent', 'iron-on', 'self-adhesive', 'unknown']),
    confidence: z.object({
      name: Confidence,
      category: Confidence,
      brand: Confidence,
      color: Confidence,
      dimensions: Confidence,
      quantity: Confidence,
    }),
  })
}

export function visionSingleSchema(categoryIds: string[]) {
  return z.object({ item: visionItemSchema(categoryIds), upcDigits: z.string().describe('Barcode digits if readable, else empty string') })
}

export function visionBulkSchema(categoryIds: string[]) {
  return z.object({ items: z.array(visionItemSchema(categoryIds)) })
}

export type VisionItem = z.infer<ReturnType<typeof visionItemSchema>>

/** Strip the SDK's local `parse` helper so the object is a plain request param. */
export function wire<T extends { type: 'json_schema'; schema: Record<string, unknown> }>(f: T) {
  return { type: f.type, schema: f.schema }
}

// ----- Mixed-color packs -----

export function assortmentSchema(categoryIds: string[]) {
  return z.object({
    name: z.string().describe('What every sheet is, without the colors, e.g. "Astrobrights cardstock"'),
    setName: z.string().describe('The pack name as printed, e.g. "Astrobrights Spectrum assortment"'),
    brand: z.string(),
    category: z.enum(categoryIds as [string, ...string[]]),
    subtype: z.string().describe('Weight or kind, e.g. "65 lb"'),
    dimensions: z.string(),
    unit: z.enum(UNITS),
    totalCount: z.number().describe('Total pieces in the pack, 0 if not printed'),
    colors: z.array(z.object({ color: z.string(), count: z.number().describe('How many of this color; 0 if unknown') })),
    colorsReadable: z.boolean().describe('false if the color names are not printed legibly in the photo'),
    countsConfident: z.boolean().describe('true only if the count per color is printed or clearly implied'),
    upcDigits: z.string(),
  })
}

export type AssortmentReading = z.infer<ReturnType<typeof assortmentSchema>>
