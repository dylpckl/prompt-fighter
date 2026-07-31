import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'

export const runtime = 'nodejs'

const TOP_N = 25

/**
 * The whole pool, ranked. Public by nature — these are the same fighters
 * everyone is already matched against as ghosts.
 *
 * Ordered by wins, then by fewest losses, so a 7-0 outranks a 7-3. Fighters
 * who have never fought are left out; a wall of 0-0 rows is not a ranking.
 *
 * No session scoping and no prompts in the payload — name, title, sprite and
 * record only.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select('id, name, title, sprite, wins, losses')
      .or('wins.gt.0,losses.gt.0')
      .order('wins', { ascending: false })
      .order('losses', { ascending: true })
      .limit(TOP_N)

    if (error) throw error

    return NextResponse.json({ fighters: data ?? [] })
  } catch (err) {
    console.error('leaderboard failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
