import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { ValidationError, parseUuid } from '@/lib/engine/validate'
import { parseRoomCode } from '@/lib/engine/bracket'
import type { RoomRow } from '../../_advance'

export const runtime = 'nodejs'

/** Two people clicking Join at once collide on (code, seat); take the next one. */
const SEAT_ATTEMPTS = 6
const UNIQUE_VIOLATION = '23505'

function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

/** Claims the next free seat for one of your fighters. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = parseRoomCode((await params).code)
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const fighterId = parseUuid(body.fighterId, 'fighter')

    const db = supabaseAdmin()

    const { data: room, error: roomError } = await db
      .from('rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (roomError) throw roomError
    if (!room) return NextResponse.json({ error: 'No room with that code.' }, { status: 404 })

    const { status, size, expires_at: expiresAt } = room as RoomRow
    if (Date.parse(expiresAt) < Date.now()) {
      return NextResponse.json({ error: 'That room has expired.' }, { status: 410 })
    }
    if (status !== 'lobby') {
      return NextResponse.json({ error: 'That room has already started.' }, { status: 409 })
    }

    // Scoping by session id is what stops one player entering — and then
    // driving the record of — somebody else's fighter. Same rule as /api/fight.
    const { data: fighter, error: fighterError } = await db
      .from('fighters')
      .select('id')
      .eq('id', fighterId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (fighterError) throw fighterError
    if (!fighter) {
      return NextResponse.json({ error: "That fighter isn't yours." }, { status: 404 })
    }

    for (let attempt = 0; attempt < SEAT_ATTEMPTS; attempt++) {
      const { data: taken, error: seatError } = await db
        .from('room_entrants')
        .select('seat, fighter_id')
        .eq('code', code)
        .order('seat')

      if (seatError) throw seatError

      const seats = (taken ?? []) as { seat: number; fighter_id: string }[]
      if (seats.some((s) => s.fighter_id === fighterId)) {
        return NextResponse.json({ error: 'That fighter is already in.' }, { status: 409 })
      }
      if (seats.length >= size) {
        return NextResponse.json({ error: 'That room is full.' }, { status: 409 })
      }

      // Lowest gap, so a room reads 0..n-1 however the joins interleaved.
      const used = new Set(seats.map((s) => s.seat))
      let seat = 0
      while (used.has(seat)) seat++

      const { error } = await db
        .from('room_entrants')
        .insert({ code, seat, fighter_id: fighterId, session_id: sessionId })

      if (!error) return NextResponse.json({ seat })
      // Either somebody took that seat first or this fighter is already in;
      // the loop re-reads and works out which.
      if (errorCode(error) !== UNIQUE_VIOLATION) throw error
    }

    return NextResponse.json({ error: 'Too many people joining at once. Try again.' }, { status: 409 })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('room join failed:', err)
    return NextResponse.json({ error: 'Something broke joining the room.' }, { status: 500 })
  }
}
