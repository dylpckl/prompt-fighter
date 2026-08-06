import { NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'

import { supabaseAdmin } from '@/lib/server/supabase'
import { toPublicFighter } from '@/lib/server/fighters'
import { simulate } from '@/lib/engine/sim'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { ValidationError, hydrateFighter, parseUuid } from '@/lib/engine/validate'
import type { Fighter, FighterCore } from '@/lib/engine/types'

export const runtime = 'nodejs'

function core(f: Fighter): FighterCore {
  return {
    name: f.name,
    stats: f.stats,
    moves: f.moves,
    flaw: f.flaw,
    favorites: f.favorites,
    rules: f.rules,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const fighterId = parseUuid(body.fighterId, 'fighter')

    const db = supabaseAdmin()

    // Scoping by session id is what stops one player driving up another
    // fighter's record. The filter is on `session_id`; the projection leaves it
    // out, because a response that echoed it back would hand out the very thing
    // this check relies on.
    const { data: challenger, error: challengerError } = await db
      .from('fighters')
      .select(PUBLIC_FIGHTER_COLUMNS)
      .eq('id', fighterId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (challengerError) throw challengerError
    if (!challenger) {
      return NextResponse.json({ error: "That fighter isn't yours." }, { status: 404 })
    }

    const { data: ghosts, error: ghostError } = await db.rpc('pick_ghost', {
      exclude_id: fighterId,
    })
    if (ghostError) throw ghostError

    const rawOpponent = (ghosts as Fighter[] | null)?.[0]
    if (!rawOpponent) {
      return NextResponse.json(
        { error: 'Nobody in the pool yet. You are the first one in.' },
        { status: 409 },
      )
    }

    // Normalized on the way out so the spirit stats the sim reads are the ones
    // the client draws, even for rows written before that budget existed — and
    // stripped, which matters most for the ghost: `pick_ghost` returns `setof
    // fighters`, so the row arrives with another player's `session_id` on it and
    // there is no projection to filter it. hydrateFighter is the filter.
    const you = hydrateFighter(challenger)
    const opponent = hydrateFighter(rawOpponent)

    const seed = randomInt(0, 2 ** 31)
    const result = simulate(core(you), core(opponent), seed)

    const { error: recordError } = await db.rpc('record_result', {
      winner: result.winner === 'a' ? challenger.id : opponent.id,
      loser: result.winner === 'a' ? opponent.id : challenger.id,
    })
    if (recordError) throw recordError

    // pick_ghost returns `setof public.fighters`, so the opponent arrives with
    // every column — including the session_id that authorises a fight. Without
    // this, one bout hands you a credential for someone else's fighter.
    return NextResponse.json({ ...result, seed, opponent: toPublicFighter(opponent) })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('fight failed:', err)
    return NextResponse.json({ error: 'Something broke in the arena.' }, { status: 500 })
  }
}
