import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { RefusedError, generateFighter } from '@/lib/server/generate'
import {
  ValidationError,
  hydrateFighter,
  normalizeFlaw,
  normalizeMove,
  normalizeRules,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
  parseUuid,
} from '@/lib/engine/validate'

export const runtime = 'nodejs'
// Generation is the slowest thing in the app; give it room before the platform
// cuts the request off.
export const maxDuration = 60

const FIGHTERS_PER_HOUR = 10

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const prompts = parsePrompts(body.prompts)

    const db = supabaseAdmin()

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await db
      .from('fighters')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .gte('created_at', since)

    if (countError) throw countError
    if ((count ?? 0) >= FIGHTERS_PER_HOUR) {
      return NextResponse.json(
        { error: "You've made a lot of fighters. Give it an hour." },
        { status: 429 },
      )
    }

    const generated = await generateFighter(prompts)
    if (!generated.safe) {
      return NextResponse.json(
        { error: "That fighter didn't make it past the door. Try something else." },
        { status: 422 },
      )
    }

    const fighter = {
      session_id: sessionId,
      name: (generated.name || 'Nameless').trim().slice(0, 24),
      title: (generated.title || 'Unproven').trim().slice(0, 32),
      prompts,
      stats: normalizeStats(generated.stats),
      moves: [normalizeMove(generated.basic, 'basic'), normalizeMove(generated.special, 'special')],
      flaw: normalizeFlaw(generated.flaw),
      // Unknown triggers and actions are dropped rather than corrected: there is
      // no sensible default for "what did you mean", and a rule quietly rewritten
      // into something legal would be a lie about the fighter the player built.
      rules: normalizeRules(generated.rules),
      sprite: normalizeSprite(generated.palette, generated.sprite),
    }

    // The caller owns this row, so nothing here would leak — but every fighter
    // leaves through the same projection so there is one rule to remember.
    const { data, error } = await db
      .from('fighters')
      .insert(fighter)
      .select(PUBLIC_FIGHTER_COLUMNS)
      .single()
    if (error) throw error

    return NextResponse.json({ fighter: hydrateFighter(data) })
  } catch (err) {
    if (err instanceof RefusedError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('create-fighter failed:', err)
    return NextResponse.json(
      { error: 'Something broke while building your fighter.' },
      { status: 500 },
    )
  }
}
