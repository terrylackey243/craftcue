// Optional add-on: illustrated sticker art from OpenAI's image model, with the user's own key.
// The browser calls api.openai.com directly (it allows cross-origin requests).
import { db } from '../../db'
import imageModels from '../../data/imageModels.json'
import { nowIso, uuid } from '../ids'
import { getSecret } from '../repo'

const API = 'https://api.openai.com/v1'

export class AddonError extends Error {}

function friendly(status: number, body: string): string {
  if (status === 401) return "That OpenAI key didn't work. Check you copied all of it, or create a new one."
  if (status === 403 && /verif/i.test(body)) return 'OpenAI needs your organization to be verified before its image model can be used. Do this once in the OpenAI dashboard (Settings, Organization, Verify), then try again.'
  if (status === 429 && /quota|billing|credit/i.test(body)) return 'Your OpenAI account is out of credit. Add some in the OpenAI dashboard (Billing), then try again.'
  if (status === 429) return 'OpenAI is busy right now. Wait a minute and try again.'
  if (status === 400 && /safety|moderation|policy/i.test(body)) return "OpenAI wouldn't draw that description. Try wording it differently."
  if (status >= 500) return 'OpenAI is having trouble right now. Please try again in a few minutes.'
  return 'OpenAI could not make that picture. Please try again.'
}

async function call(path: string, key: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  } catch {
    throw new AddonError("Couldn't reach OpenAI. Check your internet connection.")
  }
  if (!res.ok) throw new AddonError(friendly(res.status, await res.text().catch(() => '')))
  return res
}

/** Free check that a key works (lists models; no image is made). */
export async function testOpenAiKey(key: string): Promise<string | null> {
  try {
    await call('/models', key.trim(), { method: 'GET' })
    return null
  } catch (e) {
    return (e as Error).message
  }
}

/** Sticker art on a transparent background. Returns PNG blobs. */
export async function makeStickerArt(prompt: string, count: number): Promise<Blob[]> {
  const key = await getSecret('openaiApiKey')
  if (!key) throw new AddonError('Add an OpenAI key in Settings first.')
  const cfg = imageModels.openai
  const n = Math.max(1, Math.min(4, Math.round(count)))
  const res = await call('/images/generations', key, {
    method: 'POST',
    body: JSON.stringify({ model: cfg.model, prompt, n, size: cfg.size, quality: cfg.quality, background: 'transparent', output_format: 'png' }),
  })
  const json = (await res.json()) as { data?: { b64_json?: string }[] }
  const images = (json.data ?? []).map((d) => d.b64_json).filter((b): b is string => Boolean(b))
  if (!images.length) throw new AddonError('OpenAI sent back no picture. Please try again.')
  await db.usage.add({ id: uuid(), timestamp: nowIso(), feature: 'image', model: cfg.model, inputTokens: 0, outputTokens: 0, costUsd: cfg.estUsdPerImage * images.length })
  return images.map((b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: 'image/png' })
  })
}
