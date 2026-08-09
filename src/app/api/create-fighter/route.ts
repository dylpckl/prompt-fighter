import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { verifyCandidate } from '@/lib/server/sign'
import { assembleRules } from '@/lib/engine/assemble'
import type { Special } from '@/lib/engine/specials'
import { ValidationError, hydrateFighter, parsePrompts, parseUuid } from '@/lib/engine/validate'
import type { Candidate } from '@/lib/engine/types'

export const runtime = 'nodejs'

// `/api/generate-fighter` gates the costly step (the model call). This is a
// second, independent gate on the insert itself — a signed candidate can be
// replayed with different `chosenIndex` values, so without a limit here one
// generation could be turned into unlimited rows.
const FIGHTERS_PER_HOUR = 10

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    // The model never sees these again after generation, but the row still
    // records what was asked for — it's the player's own writing, submitted
    // fresh here exactly as it always was pre-split; the server still never
    // sends it back out (see lib/server/fighters.ts).
    const prompts = parsePrompts(body.prompts)

    if (!body.candidate || typeof body.candidate !== 'object') {
      throw new ValidationError('Missing candidate.')
    }
    if (!Array.isArray(body.specials)) {
      throw new ValidationError('Missing specials.')
    }
    if (typeof body.signature !== 'string' || !body.signature) {
      throw new ValidationError('Missing signature.')
    }

    // This is the anti-cheat. Rules are deliberately unbounded (lib/engine/rules.ts),
    // so the only thing that may reach the database is a candidate this server
    // generated, safety-checked, and signed itself — never re-validated here,
    // because verification *is* the validation. A tampered or hand-crafted
    // payload fails this and goes no further.
    const verified = verifyCandidate({ candidate: body.candidate, specials: body.specials }, body.signature)
    if (!verified) {
      return NextResponse.json(
        { error: "That fighter changed on the way here. Try again." },
        { status: 400 },
      )
    }

    const candidate = body.candidate as Candidate
    const specials = body.specials as Special[]

    const chosenIndex =
      typeof body.chosenIndex === 'number' && Number.isInteger(body.chosenIndex)
        ? body.chosenIndex
        : null
    const chosen = chosenIndex == null ? null : (specials[chosenIndex] ?? null)
    const rules = assembleRules(candidate.rules, chosen)

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

    // Explicit named fields off `candidate` — never spread it. `session_id`
    // comes from the request, never the payload; `id`/`wins`/`losses`/
    // `created_at` are DB defaults.
    const fighter = {
      session_id: sessionId,
      name: candidate.name,
      title: candidate.title,
      prompts,
      stats: candidate.stats,
      moves: candidate.moves,
      flaw: candidate.flaw,
      rules,
      sprite: candidate.sprite,
    }

    // Every fighter leaves through the same projection so there is one rule to
    // remember — never select('*') here.
    const { data, error } = await db
      .from('fighters')
      .insert(fighter)
      .select(PUBLIC_FIGHTER_COLUMNS)
      .single()
    if (error) throw error

    return NextResponse.json({ fighter: hydrateFighter(data) })
  } catch (err) {
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
