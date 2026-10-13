import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'

export const runtime = 'nodejs'

const TOP_N = 50

/**
 * The whole pool, ranked. Public by nature — these are the same fighters
 * everyone is already matched against as ghosts.
 *
 * Ordered by Elo, then wins as the tiebreak, which keeps the pre-Elo order for
 * fighters that haven't fought since ratings arrived. Fighters who have never
 * fought are left out; a wall of unrated rows is not a ranking.
 *
 * No session scoping and no prompts in the payload — name, title, sprite and
 * record only.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select('id, name, title, sprite, wins, losses, rating, favorites, lives_lost, version, dead_at')
      .or('wins.gt.0,losses.gt.0')
      .order('rating', { ascending: false })
      .order('wins', { ascending: false })
      .limit(TOP_N)

    if (error) throw error

    // How many ranked fighters exist, so the page can say what it isn't
    // showing rather than looking like the whole pool.
    const { count } = await supabaseAdmin()
      .from('fighters')
      .select('id', { count: 'exact', head: true })
      .or('wins.gt.0,losses.gt.0')

    return NextResponse.json({ fighters: data ?? [], total: count ?? (data?.length ?? 0) })
  } catch (err) {
    console.error('leaderboard failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
