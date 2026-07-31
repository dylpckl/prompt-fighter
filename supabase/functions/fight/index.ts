import { createClient } from 'npm:@supabase/supabase-js@2'

import { fail, json, parseUuid, preflight } from '../_shared/http.ts'
import { simulate } from '../_shared/sim.ts'
import type { Fighter, FighterCore } from '../_shared/types.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

function core(f: Fighter): FighterCore {
  return { name: f.name, stats: f.stats, moves: f.moves, flaw: f.flaw }
}

function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const fighterId = parseUuid(body.fighterId, 'fighter')

    const { data: challenger, error: challengerError } = await supabase
      .from('fighters')
      .select('*')
      .eq('id', fighterId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (challengerError) throw challengerError
    if (!challenger) return fail("That fighter isn't yours.", 404)

    const { data: ghosts, error: ghostError } = await supabase.rpc('pick_ghost', {
      exclude_id: fighterId,
    })
    if (ghostError) throw ghostError

    const opponent = (ghosts as Fighter[] | null)?.[0]
    if (!opponent) {
      return fail('Nobody in the pool yet. You are the first one in.', 409)
    }

    const seed = newSeed()
    const result = simulate(core(challenger as Fighter), core(opponent), seed)

    const winnerId = result.winner === 'a' ? challenger.id : opponent.id
    const loserId = result.winner === 'a' ? opponent.id : challenger.id

    const { error: recordError } = await supabase.rpc('record_result', {
      winner: winnerId,
      loser: loserId,
    })
    if (recordError) throw recordError

    return json({ ...result, seed, opponent })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid ')) return fail(err.message, 400)
    console.error('fight failed:', err)
    return fail('Something broke in the arena.', 500)
  }
})
