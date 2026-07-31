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
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const fighterId = parseUuid(id, 'fighter')

    // Anyone can reach this by id — the leaderboard links straight to it — so
    // it returns the public projection only. See lib/server/fighters.ts.
    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select(PUBLIC_FIGHTER_COLUMNS)
      .eq('id', fighterId)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such fighter.' }, { status: 404 })

    return NextResponse.json({ fighter: hydrateFighter(data) })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('fighter lookup failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
