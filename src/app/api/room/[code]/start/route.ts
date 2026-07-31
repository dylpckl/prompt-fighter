import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { ValidationError, hydrateFighter, parseUuid } from '@/lib/engine/validate'
import { buildFirstRound, parseRoomCode } from '@/lib/engine/bracket'
import { advanceRoom } from '../../_advance'
import type { MatchRow, RoomRow } from '../../_advance'
import type { Fighter } from '@/lib/engine/types'

export const runtime = 'nodejs'

const MIN_ENTRANTS = 2
const UNIQUE_VIOLATION = '23505'

function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

/**
 * Host only. Locks the field, draws the bracket, and kicks off match one.
 *
 * The whole tree is written up front — later rounds as empty rows — so the
 * polling GET can draw the bracket immediately and advancing is a plain UPDATE
 * into a row that already exists rather than an insert that could race.
 */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = parseRoomCode((await params).code)
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')

    const db = supabaseAdmin()

    const { data, error: roomError } = await db
      .from('rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (roomError) throw roomError
    if (!data) return NextResponse.json({ error: 'No room with that code.' }, { status: 404 })

    const room = data as RoomRow
    if (room.host_session !== sessionId) {
      return NextResponse.json({ error: 'Only the host can start this one.' }, { status: 403 })
    }
    if (Date.parse(room.expires_at) < Date.now()) {
      return NextResponse.json({ error: 'That room has expired.' }, { status: 410 })
    }
    if (room.status !== 'lobby') {
      return NextResponse.json({ error: 'That room has already started.' }, { status: 409 })
    }

    const { data: entrants, error: entrantError } = await db
      .from('room_entrants')
      .select('seat, fighter_id')
      .eq('code', code)
      .order('seat')

    if (entrantError) throw entrantError

    const entrantIds = ((entrants ?? []) as { fighter_id: string }[]).map((e) => e.fighter_id)
    if (entrantIds.length < MIN_ENTRANTS) {
      return NextResponse.json({ error: 'Need at least two fighters.' }, { status: 409 })
    }

    // Shuffled off the room seed and padded to a power of two, so an odd field
    // just means byes. A five-person room works; nobody waits for a sixth.
    const { size, rounds, pairings } = buildFirstRound(entrantIds, Number(room.seed))

    const empty = { winner: null, seed: null, log: null, starts_at: null, ends_at: null }
    const rows: MatchRow[] = pairings.map((p) => ({
      code,
      round: 1,
      slot: p.slot,
      a_fighter: p.a,
      b_fighter: p.b,
      ...empty,
    }))
    for (let round = 2; round <= rounds; round++) {
      for (let slot = 0; slot < size / 2 ** round; slot++) {
        rows.push({ code, round, slot, a_fighter: null, b_fighter: null, ...empty })
      }
    }

    // Inserted before the status flips, so the tree is never missing from a
    // running room.
    //
    // Those are two writes with no transaction around them, so the interesting
    // case is the one where the first lands and the second doesn't — the request
    // dies, or the function is killed, and the room is left holding a full
    // bracket while `status` still says 'lobby'. `advanceRoom` refuses to touch
    // a room that isn't 'running', so nothing would ever start it again.
    //
    // So a primary-key collision here is treated as "the tree already exists",
    // not "go away": adopt whatever is stored and carry on to the flip, which is
    // itself conditional on 'lobby' and therefore safe to repeat. That makes
    // Start idempotent, recovers a room stranded between the two writes, and
    // handles two hosts double-clicking at once. A room that is genuinely
    // running was already turned away by the status check above.
    let tree = rows
    const { error: insertError } = await db.from('matches').insert(rows)
    if (insertError) {
      if (errorCode(insertError) !== UNIQUE_VIOLATION) throw insertError

      const { data: existing, error: readError } = await db
        .from('matches')
        .select('*')
        .eq('code', code)
        .order('round')
        .order('slot')

      if (readError) throw readError
      // The stored tree wins: a previous attempt may have drawn it from a
      // different field, and the matches rows are what every poller reads.
      tree = (existing ?? []) as MatchRow[]
    }

    const { error: statusError } = await db
      .from('rooms')
      .update({ status: 'running' })
      .eq('code', code)
      .eq('status', 'lobby')

    if (statusError) throw statusError
    room.status = 'running'

    // Off the stored tree rather than the entrant list, which may not be what
    // the bracket was drawn from if we just adopted an earlier attempt's.
    const fighterIds = [
      ...new Set(tree.flatMap((m) => [m.a_fighter, m.b_fighter]).filter((id): id is string => !!id)),
    ]

    const { data: fighterRows, error: fighterError } = await db
      .from('fighters')
      .select(PUBLIC_FIGHTER_COLUMNS)
      .in('id', fighterIds)

    if (fighterError) throw fighterError
    const fighters = new Map(
      ((fighterRows ?? []) as Fighter[]).map(hydrateFighter).map((f) => [f.id, f]),
    )

    // Kick off match one now rather than waiting on the first poll.
    await advanceRoom(db, room, tree, fighters)

    // Reported off the tree that is actually stored, for the same reason.
    const drawnRounds = tree.reduce((n, m) => Math.max(n, m.round), 0)
    return NextResponse.json({
      started: true,
      size: tree === rows ? size : 2 ** drawnRounds,
      rounds: tree === rows ? rounds : drawnRounds,
    })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('room start failed:', err)
    return NextResponse.json({ error: 'Something broke starting the room.' }, { status: 500 })
  }
}
