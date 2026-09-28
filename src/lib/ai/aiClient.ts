// The only module that talks to Anthropic. Everything else goes through `getAiClient()`, so tests
// can swap in a fake with `setAiClientForTests()` and the transport can change later (spec 3.2).
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../../db'
import { getApiKey } from '../repo'
import type { AiFeature } from '../../types'
import { nowIso } from '../ids'

export interface AiClient {
  createMessage(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
}

export class NoKeyError extends Error {
  constructor() {
    super('Smart suggestions need a quick one-time setup.')
  }
}

let testClient: AiClient | null = null

export function setAiClientForTests(client: AiClient | null): void {
  testClient = client
}

export function makeAnthropicClient(apiKey: string): AiClient {
  const client = new Anthropic({
    apiKey,
    // The key belongs to the person using this device and is only sent to api.anthropic.com.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  })
  return {
    // Streaming under the hood avoids HTTP timeouts on long answers; callers just get the message.
    createMessage: (params) => client.messages.stream(params).finalMessage(),
  }
}

export async function getAiClient(): Promise<AiClient> {
  if (testClient) return testClient
  const key = await getApiKey()
  if (!key) throw new NoKeyError()
  return makeAnthropicClient(key)
}

export async function logUsage(feature: AiFeature, message: Anthropic.Message): Promise<void> {
  const u = message.usage
  await db.usageLog.add({
    timestamp: nowIso(),
    feature,
    model: message.model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  })
}

export type AiErrorKind = 'no-key' | 'invalid-key' | 'no-credits' | 'permission' | 'rate-limit' | 'overloaded' | 'network' | 'refused' | 'bad-response' | 'unknown'

export interface FriendlyError {
  kind: AiErrorKind
  message: string
}

export class AiResponseError extends Error {
  kind: AiErrorKind
  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/** Plain-English explanation for anything an AI call can throw (spec 7.2). */
export function friendlyError(e: unknown): FriendlyError {
  if (e instanceof NoKeyError) return { kind: 'no-key', message: e.message }
  if (e instanceof AiResponseError) return { kind: e.kind, message: e.message }
  if (e instanceof Anthropic.AuthenticationError) {
    return { kind: 'invalid-key', message: "That key didn't work. Check that you copied the whole key (it starts with sk-ant-), or create a new one." }
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return { kind: 'permission', message: "This key isn't allowed to do that. Check the key's workspace settings in the Anthropic Console." }
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { kind: 'rate-limit', message: 'Too many requests at once. Wait a minute and try again.' }
  }
  if (e instanceof Anthropic.BadRequestError) {
    // The API reports an empty balance as a 400 with no dedicated error type, so the message is
    // the only signal available.
    if (/credit balance|billing|purchase credits/i.test(e.message)) {
      return { kind: 'no-credits', message: 'Your Anthropic account is out of credits. Add credits in the Anthropic Console (Billing), then try again.' }
    }
    return { kind: 'unknown', message: 'Anthropic could not handle that request. Please try again.' }
  }
  if (e instanceof Anthropic.InternalServerError) {
    return { kind: 'overloaded', message: 'Anthropic is very busy right now. Please try again in a few minutes.' }
  }
  if (e instanceof Anthropic.APIConnectionError || (e instanceof TypeError && /fetch|network/i.test(e.message))) {
    return { kind: 'network', message: "Couldn't reach Anthropic. Check your internet connection and try again." }
  }
  if (e instanceof Anthropic.APIError && e.status === 529) {
    return { kind: 'overloaded', message: 'Anthropic is very busy right now. Please try again in a few minutes.' }
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' }
}

export function firstText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export function checkStop(message: Anthropic.Message): void {
  if (message.stop_reason === 'refusal') {
    throw new AiResponseError('refused', "Claude wasn't able to help with that request. Try wording it differently.")
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiResponseError('bad-response', 'The answer was too long and got cut off. Try asking for fewer ideas.')
  }
}
