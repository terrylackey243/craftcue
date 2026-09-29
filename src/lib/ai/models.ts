import models from '../../data/models.json'
import pricing from '../../data/pricing.json'
import type { Quality, UsageLogEntry } from '../../types'

export function recommendModel(q: Quality): string {
  return models.recommend[q]
}

export function visionModel(q: Quality): string {
  return models.vision[q]
}

export const TEST_KEY_MODEL = models.testKey

type Price = { input: number; output: number }
const PRICES = pricing.models as Record<string, Price>

/** Haiku 4.5 predates the effort parameter and rejects it. */
export function supportsEffort(model: string): boolean {
  return !model.startsWith('claude-haiku-4')
}

export function priceFor(model: string): Price | undefined {
  if (PRICES[model]) return PRICES[model]
  // Tolerate dated/aliased IDs, e.g. claude-haiku-4-5-20251001.
  const key = Object.keys(PRICES).find((k) => model.startsWith(k))
  return key ? PRICES[key] : undefined
}

/** Estimated dollars for one logged call. */
export function costOf(e: Omit<UsageLogEntry, 'id'>): number {
  if (e.costUsd !== undefined) return e.costUsd
  const p = priceFor(e.model)
  if (!p) return 0
  const read = e.cacheReadTokens ?? 0
  const write = e.cacheWriteTokens ?? 0
  return (
    (e.inputTokens * p.input + read * p.input * pricing.cacheReadMultiplier + write * p.input * pricing.cacheWriteMultiplier + e.outputTokens * p.output) /
    1_000_000
  )
}

export interface MonthSummary {
  suggestions: number
  designs: number
  images: number
  photoScans: number
  dollars: number
}

export function summarizeMonth(entries: Omit<UsageLogEntry, 'id'>[], now = new Date()): MonthSummary {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = entries.filter((e) => localMonth(e.timestamp) === prefix)
  return {
    suggestions: month.filter((e) => e.feature === 'recommend').length,
    designs: month.filter((e) => e.feature === 'design').length,
    images: month.filter((e) => e.feature === 'image').length,
    photoScans: month.filter((e) => e.feature === 'vision-intake').length,
    dollars: month.reduce((sum, e) => sum + costOf(e), 0),
  }
}

function localMonth(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
