import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { ValidationError, parseUuid } from '@/lib/engine/validate'

export const runtime = 'nodejs'

// A session that has hit this many fighters is not browsing a roster any more.
const MAX_ROSTER = 50

/**
 * Every fighter a session has built. `session_id` was already on the row for
 * rate limiting; this is the read side of it.
 *
 * Only the display fields — prompts stay out of the payload, and the full row
 * comes back through /api/fighter/[id] when one is made active.
 */
export async function GET(req: Request) {
  try {
    const sessionId = parseUuid(new URL(req.url).searchParams.get('sessionId'), 'session')

    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select('id, name, title, sprite, wins, losses, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(MAX_ROSTER)

    if (error) throw error

    return NextResponse.json({ fighters: data ?? [] })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('roster lookup failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
