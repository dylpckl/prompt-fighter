import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

import { fail, json, parseUuid, preflight } from '../_shared/http.ts'
import { FIGHTER_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from '../_shared/generation.ts'
import {
  ValidationError,
  normalizeFlaw,
  normalizeMove,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
} from '../_shared/validate.ts'
import type { FighterPrompts } from '../_shared/types.ts'

const MODEL = 'claude-opus-5'
const FIGHTERS_PER_HOUR = 10

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

interface Generated {
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

async function callModel(prompts: FighterPrompts) {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        // Same prefix on every generation — worth caching.
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: FIGHTER_SCHEMA },
    },
    messages: [{ role: 'user' as const, content: buildUserPrompt(prompts) }],
  }

  // Opus 5's safety classifiers can decline a request outright. Server-side
  // fallbacks re-serve it on Anthropic's recommended substitute in the same
  // call; if the beta isn't available on this account we retry plainly.
  try {
    return await anthropic.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as never)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/fallback|beta/i.test(message)) throw err
    console.warn('server-side fallbacks unavailable, retrying without:', message)
    return await anthropic.messages.create(params as never)
  }
}

function extractJson(response: { content: Array<{ type: string; text?: string }> }): Generated {
  const block = response.content.find((b) => b.type === 'text' && typeof b.text === 'string')
  if (!block?.text) throw new ValidationError('The generator returned nothing. Try again.')
  try {
    return JSON.parse(block.text) as Generated
  } catch {
    throw new ValidationError('The generator returned malformed output. Try again.')
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const prompts = parsePrompts(body.prompts)

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from('fighters')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .gte('created_at', since)

    if (countError) throw countError
    if ((count ?? 0) >= FIGHTERS_PER_HOUR) {
      return fail("You've made a lot of fighters. Give it an hour.", 429)
    }

    const response = await callModel(prompts)

    if (response.stop_reason === 'refusal') {
      return fail("That one didn't make it past the door. Try something else.", 422)
    }

    const generated = extractJson(response)
    if (!generated.safe) {
      return fail("That fighter didn't make it past the door. Try something else.", 422)
    }

    const fighter = {
      session_id: sessionId,
      name: (generated.name || 'Nameless').trim().slice(0, 24),
      title: (generated.title || 'Unproven').trim().slice(0, 32),
      prompts,
      stats: normalizeStats(generated.stats),
      moves: [normalizeMove(generated.basic, 'basic'), normalizeMove(generated.special, 'special')],
      flaw: normalizeFlaw(generated.flaw),
      sprite: normalizeSprite(generated.palette, generated.sprite),
    }

    const { data, error } = await supabase.from('fighters').insert(fighter).select().single()
    if (error) throw error

    return json({ fighter: data })
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message, 400)
    if (err instanceof Error && err.message.startsWith('Invalid ')) return fail(err.message, 400)
    console.error('create-fighter failed:', err)
    return fail('Something broke while building your fighter.', 500)
  }
})
