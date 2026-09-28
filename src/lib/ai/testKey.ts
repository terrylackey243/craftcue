import { db } from '../../db'
import { nowIso } from '../ids'
import { friendlyError, makeAnthropicClient, type FriendlyError } from './aiClient'
import { TEST_KEY_MODEL } from './models'

export function looksLikeKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())
}

/** Cheapest possible call: the smallest model, a one-word prompt, a one-token answer. */
export async function testKey(key: string): Promise<{ ok: true } | { ok: false; error: FriendlyError }> {
  try {
    const client = makeAnthropicClient(key.trim())
    const message = await client.createMessage({
      model: TEST_KEY_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    })
    await db.usageLog.add({
      timestamp: nowIso(),
      feature: 'test-key',
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: friendlyError(e) }
  }
}
