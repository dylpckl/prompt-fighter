import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { clientKey } from '@/lib/server/clientKey'
import { ValidationError, parseUuid } from '@/lib/engine/validate'

export const runtime = 'nodejs'

/**
 * One favorite per person, and it is worth something: the count feeds the crowd
 * pressure meter (see `lib/engine/favorites.ts`). That is the whole reason this
 * endpoint is more careful than a "like" button needs to be — a vote here moves
 * fight outcomes, so it is capped on two identities at once and refuses to let
 * anyone vote for themselves.
 *
 * The cap lives in `set_favorite` rather than up here. Releasing the old row and
 * moving the counter are one statement in one function, so there is no window
 * where the count and the rows disagree, and two simultaneous votes from the
 * same person can't both land. See migration 0005.
 */

/**
 * Both halves of a voter's identity. `session_id` is the browser's self-issued
 * UUID; `voter_key` is the hashed client address, which is the one the caller
 * doesn't choose. A vote matches on either, so clearing site data moves your
 * vote rather than earning you a second one.
 */
function voterFilter(sessionId: string, voterKey: string): string {
  // PostgREST `.or()` takes a comma-separated filter list. Neither value can
  // contain a comma or a parenthesis — a UUID is hex-and-dashes after
  // `parseUuid`, and a voter key is `ip:<hex>` or `session:<uuid>`.
  return `session_id.eq.${sessionId},voter_key.eq.${voterKey}`
}

/**
 * What this person has favorited, if anything. Matches on either identity, so a
 * player who cleared storage is shown the vote they still hold rather than an
 * empty heart they'd only be able to fill by taking their own vote back.
 */
export async function GET(req: Request) {
  try {
    const sessionId = parseUuid(new URL(req.url).searchParams.get('sessionId'), 'session')
    const voterKey = clientKey(req, sessionId)

    // Two rows can match: one found by session, one by voter key, if this
    // browser and this address last voted separately. The next POST collapses
    // them into one; until then the session's own row is the truthful answer,
    // because that is the vote this browser cast.
    const { data, error } = await supabaseAdmin()
      .from('favorites')
      .select('session_id, fighter_id')
      .or(voterFilter(sessionId, voterKey))
      .limit(2)

    if (error) throw error

    const rows = (data ?? []) as { session_id: string; fighter_id: string }[]
    const held = rows.find((row) => row.session_id === sessionId) ?? rows[0]

    return NextResponse.json({ fighterId: held?.fighter_id ?? null })
  } catch (err) {
    return failure(err, 'favorite lookup failed')
  }
}

/** Move this person's one favorite onto `fighterId`. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const fighterId = parseUuid(body.fighterId, 'fighter')

    const db = supabaseAdmin()

    // `session_id` is a credential everywhere else in this app, and it is read
    // here purely to compare — it is never returned, and the 400 below says
    // nothing a caller who already owns the fighter doesn't know.
    const { data: target, error: targetError } = await db
      .from('fighters')
      .select('session_id')
      .eq('id', fighterId)
      .maybeSingle()

    if (targetError) throw targetError
    if (!target) return NextResponse.json({ error: 'No such fighter.' }, { status: 404 })

    // A favorite is meant to mean "someone else rates this". Without this check
    // the rational move is for everyone to favorite themselves, the baseline
    // shifts to +1 across the board, and the number stops carrying information.
    //
    // It is a check on the *session*, which is what this app has. Somebody
    // determined enough to build a fighter in one browser profile and favorite
    // it from another still can — the voter key makes that cost an IP, and the
    // curve in favorites.ts makes one vote worth about four percent of one
    // meter. That is the intended ceiling on the exploit, not an oversight.
    if (target.session_id === sessionId) {
      return NextResponse.json({ error: "You can't be your own fan." }, { status: 400 })
    }

    const { data: favorites, error } = await db.rpc('set_favorite', {
      p_session: sessionId,
      p_fighter: fighterId,
      p_voter_key: clientKey(req, sessionId),
    })
    if (error) throw error

    return NextResponse.json({ fighterId, favorites: (favorites as number) ?? 0 })
  } catch (err) {
    return failure(err, 'favorite failed')
  }
}

/** Take it back. Idempotent — withdrawing a vote you don't hold is a 200. */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')

    const { data: released, error } = await supabaseAdmin().rpc('clear_favorite', {
      p_session: sessionId,
      p_voter_key: clientKey(req, sessionId),
    })
    if (error) throw error

    return NextResponse.json({ cleared: ((released as number) ?? 0) > 0 })
  } catch (err) {
    return failure(err, 'unfavorite failed')
  }
}

function failure(err: unknown, context: string): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
  console.error(`${context}:`, err)
  return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
}
