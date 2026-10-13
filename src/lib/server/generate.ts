import Anthropic from '@anthropic-ai/sdk'

import { FIGHTER_SCHEMA, SYSTEM_PROMPT } from '@/lib/engine/generation'
import { ValidationError } from '@/lib/engine/validate'

// Sonnet 5 holds up on sprites and names, including on prompts that try to
// cheat. Haiku 4.5 was the false economy — illegible sprites, and it rejects
// `effort` outright, so dropping a tier is not just an id swap.
const MODEL = 'claude-sonnet-5'

export interface Generated {
  safe: boolean
  name: string
  title: string
  stats: unknown
  basic: unknown
  special: unknown
  flaw: unknown
  palette: unknown
  sprite: unknown
}

export class RefusedError extends Error {}

let client: Anthropic | null = null

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set.')
    client = new Anthropic({ apiKey })
  }
  return client
}

function extractJson(content: Array<{ type: string; text?: string }>): Generated {
  const block = content.find((b) => b.type === 'text' && typeof b.text === 'string')
  if (!block?.text) throw new ValidationError('The generator returned nothing. Try again.')
  try {
    return JSON.parse(block.text) as Generated
  } catch {
    throw new ValidationError('The generator returned malformed output. Try again.')
  }
}

/** `userPrompt` is `buildUserPrompt` for a new fighter, `buildEditPrompt` for an edit. */
export async function generateFighter(userPrompt: string): Promise<Generated> {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        // Identical on every generation, so it's worth a cache breakpoint.
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    output_config: {
      // Measured 40-55s per fighter at 'medium', against a 60s maxDuration —
      // too close to the edge to ship. 'low' keeps generation well inside the
      // limit; quality holds up fine because the schema does the hard part.
      effort: 'low',
      format: { type: 'json_schema', schema: FIGHTER_SCHEMA },
    },
    messages: [{ role: 'user' as const, content: userPrompt }],
  }

  // Server-side fallbacks re-serve a classifier refusal on a substitute model
  // within the same call. Not every model or account accepts the beta, so on a
  // fallback/beta error retry without it.
  let response
  try {
    response = await anthropic().beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as never)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    if (!/fallback|beta/i.test(detail)) throw err
    console.warn('server-side fallbacks unavailable, retrying without:', detail)
    response = await anthropic().messages.create(params as never)
  }

  if (response.stop_reason === 'refusal') {
    throw new RefusedError("That one didn't make it past the door. Try something else.")
  }

  return extractJson(response.content)
}
