import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { clientKey } from '@/lib/server/clientKey'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { RefusedError, generateFighter } from '@/lib/server/generate'
import {
  ValidationError,
  hydrateFighter,
  normalizeFlaw,
  normalizeMove,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
  parseUuid,
} from '@/lib/engine/validate'

export const runtime = 'nodejs'
// Generation is the slowest thing in the app; give it room before the platform
// cuts the request off.
export const maxDuration = 60

// Every attempt costs a model call, so these count attempts, not fighters — a
// refused or unsafe prompt is billed too. See migration 0006.
const PER_SESSION_PER_HOUR = 10
// Looser than per-session: a room full of people on one wifi shares an address.
const PER_CLIENT_PER_HOUR = 30
// The ceiling on the daily bill, across everyone.
const PER_DAY = Number(process.env.GENERATIONS_PER_DAY) || 500

const REFUSALS: Record<string, string> = {
  session: "You've made a lot of fighters. Give it an hour.",
  client: "You've made a lot of fighters. Give it an hour.",
  global: 'The forge is closed for today. Come back tomorrow.',
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const prompts = parsePrompts(body.prompts)

    const db = supabaseAdmin()

    const { data: claim, error: claimError } = await db.rpc('claim_generation', {
      p_client_key: clientKey(req, sessionId),
      p_session: sessionId,
      p_per_session: PER_SESSION_PER_HOUR,
      p_per_client: PER_CLIENT_PER_HOUR,
      p_per_day: PER_DAY,
    })
    if (claimError) throw claimError
    if (claim !== 'ok') {
      return NextResponse.json(
        { error: REFUSALS[claim as string] ?? REFUSALS.session },
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
