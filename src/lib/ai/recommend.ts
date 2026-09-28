import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicError } from '@anthropic-ai/sdk'
import type { Category, GoalRequest, Person, Supply, UserSetup } from '../../types'
import { AiResponseError, checkStop, firstText, getAiClient, logUsage } from './aiClient'
import { recommendModel, supportsEffort } from './models'
import { buildContextBlock, describeRequest, SYSTEM_RULES } from './prompt'
import { recommendationsFormat, wire, type RawRecommendations } from './schemas'
import { classify } from './validate'

export interface RecommendInput {
  setup: UserSetup
  supplies: Supply[]
  categories: Map<string, Category>
  request: GoalRequest
  person?: Person
  avoidTitles?: string[]
}

export function buildRecommendParams(input: RecommendInput): Anthropic.MessageCreateParamsNonStreaming {
  const model = recommendModel(input.setup.quality)
  const context = buildContextBlock(input.setup, input.supplies, input.categories, input.request.goal)
  return {
    model,
    max_tokens: 16000,
    // Rules and the crafter's machine/stash change rarely between requests, so they're cached;
    // the goal details go in the user turn after the cache breakpoint.
    system: [
      { type: 'text', text: SYSTEM_RULES },
      { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: describeRequest(input.request, input.setup, input.person, input.avoidTitles) }],
    output_config: {
      format: wire(recommendationsFormat),
      ...(supportsEffort(model) ? { effort: input.setup.quality === 'best' ? 'high' : 'medium' } : {}),
    },
  } as Anthropic.MessageCreateParamsNonStreaming
}

export function parseRecommendations(text: string): RawRecommendations {
  try {
    return recommendationsFormat.parse(text) as RawRecommendations
  } catch (e) {
    if (e instanceof AnthropicError) throw new AiResponseError('bad-response', 'The suggestions came back in an unexpected shape.')
    throw e
  }
}

/** Ask for suggestions, retrying once if the answer doesn't match the schema (spec 9.5). */
export async function recommend(input: RecommendInput) {
  const client = await getAiClient()
  const params = buildRecommendParams(input)
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.createMessage(params)
    await logUsage('recommend', message)
    try {
      checkStop(message)
      const parsed = parseRecommendations(firstText(message))
      const batch = input.request.goal === 'sell' ? Math.max(1, input.request.howMany) : 1
      return { ...classify(parsed.suggestions, input.supplies, input.setup, batch), note: parsed.note, batch }
    } catch (e) {
      lastError = e
      if (e instanceof AiResponseError && e.kind === 'refused') throw e
    }
  }
  throw lastError instanceof AiResponseError
    ? new AiResponseError('bad-response', "Couldn't get usable suggestions this time. Please try again.")
    : lastError
}
