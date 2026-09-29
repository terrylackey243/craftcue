// Optional add-on: illustrated vector art from Recraft (real SVG), with the user's own key.
// The browser calls Recraft directly (it allows cross-origin requests).
import { db } from '../../db'
import imageModels from '../../data/imageModels.json'
import { nowIso, uuid } from '../ids'
import { getSecret } from '../repo'
import { AddonError } from './openaiImages'

const API = 'https://external.api.recraft.ai/v1'

function friendly(status: number): string {
  if (status === 401 || status === 403) return "That Recraft key didn't work. Check you copied all of it, or create a new one."
  if (status === 402) return 'Your Recraft account is out of API units. Add some in Recraft (API, Buy units), then try again.'
  if (status === 429) return 'Recraft is busy right now. Wait a minute and try again.'
  if (status >= 500) return 'Recraft is having trouble right now. Please try again in a few minutes.'
  return 'Recraft could not make that design. Try wording it differently.'
}

async function call(path: string, key: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } })
  } catch {
    throw new AddonError("Couldn't reach Recraft. Check your internet connection.")
  }
  if (!res.ok) throw new AddonError(friendly(res.status))
  return res
}

/** Free check that a key works; also returns the remaining API units. */
export async function testRecraftKey(key: string): Promise<{ error: string | null; credits?: number }> {
  try {
    const res = await call('/users/me', key.trim(), { method: 'GET' })
    const me = (await res.json()) as { credits?: number }
    return { error: null, credits: me.credits }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Flat vector art in (only) the given colors, as SVG text. */
export async function makeVectorArt(prompt: string, colors: string[]): Promise<string> {
  const key = await getSecret('recraftApiKey')
  if (!key) throw new AddonError('Add a Recraft key in Settings first.')
  const cfg = imageModels.recraft
  const res = await call('/images/generations', key, {
    method: 'POST',
    body: JSON.stringify({
      model: cfg.model,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
      controls: { colors: colors.slice(0, 10).map((c) => ({ rgb: hexToRgb(c) })), background_color: { rgb: [255, 255, 255] } },
    }),
  })
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new AddonError('Recraft sent back no design. Please try again.')
  await db.usage.add({ id: uuid(), timestamp: nowIso(), feature: 'image', model: cfg.model, inputTokens: 0, outputTokens: 0, costUsd: cfg.estUsdPerImage })
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
}
