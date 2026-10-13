import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { ValidationError, hydrateFighter, parseUuid } from '@/lib/engine/validate'

export const runtime = 'nodejs'

/**
 * Lets a returning player pick their fighter back up. Reads go through here
 * rather than PostgREST so the browser never needs a Supabase key at all.
 *
 * Unauthenticated and keyed on a public id, so it projects the public columns
 * rather than `*`: `session_id` is what /api/fight and the room join treat as
 * proof of ownership, and this endpoint would otherwise hand it to anyone who
 * read an id off the leaderboard.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const fighterId = parseUuid(id, 'fighter')
    const asked = new URL(req.url).searchParams.get('sessionId')
    const sessionId = asked ? parseUuid(asked, 'session') : null

    // Anyone can reach this by id — the leaderboard links straight to it — so
    // it returns the public projection only. See lib/server/fighters.ts.
    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select(`${PUBLIC_FIGHTER_COLUMNS}, session_id, prompts`)
      .eq('id', fighterId)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such fighter.' }, { status: 404 })

    // hydrateFighter strips session_id and prompts. The owner gets their own
    // prompts back — the edit screen starts from them. Everyone gets a dead
    // fighter's: the obituary is where the prompts finally go public.
    const row = data as unknown as { session_id: string; prompts: unknown }
    const fighter = hydrateFighter(data)
    if (fighter.dead_at || (sessionId && row.session_id === sessionId)) {
      return NextResponse.json({ fighter: { ...fighter, prompts: row.prompts } })
    }
    return NextResponse.json({ fighter })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('fighter lookup failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
