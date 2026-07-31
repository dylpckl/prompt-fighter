import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { ValidationError, hydrateFighter, parseUuid } from '@/lib/engine/validate'
import { BEAT_MS, parseRoomCode } from '@/lib/engine/bracket'
import { advanceRoom } from '../_advance'
import type { MatchRow, RoomRow } from '../_advance'
import type { Fighter } from '@/lib/engine/types'
import type { RoomView } from '@/lib/api'

export const runtime = 'nodejs'

/**
 * The only endpoint a viewer polls, roughly every 1.5s. It is not a tick — the
 * client already has the whole log and derives its own beat from `starts_at`.
 * This exists to learn that one match ended and the next began.
 *
 * It also does the advancing. Whichever poller arrives first past a match's
 * `ends_at` claims the next one with a conditional UPDATE and simulates it;
 * everybody else reads the result. No host needs to stay on the page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = parseRoomCode((await params).code)
    // Optional: only used to tell this viewer which entrant is theirs and
    // whether they hold the Start button.
    const rawSession = new URL(req.url).searchParams.get('sessionId')
    const sessionId = rawSession ? parseUuid(rawSession, 'session') : null

    const db = supabaseAdmin()

    const { data: roomRow, error: roomError } = await db
      .from('rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (roomError) throw roomError
    if (!roomRow) return NextResponse.json({ error: 'No room with that code.' }, { status: 404 })
    const room = roomRow as RoomRow

    const { data: entrantRows, error: entrantError } = await db
      .from('room_entrants')
      .select('seat, fighter_id, session_id')
      .eq('code', code)
      .order('seat')

    if (entrantError) throw entrantError
    const entrants = (entrantRows ?? []) as { seat: number; fighter_id: string; session_id: string }[]

    // One fetch serves both the advance (which needs stats and moves) and the
    // panel the client draws (which needs the name and sprite).
    let fighters = new Map<string, Fighter>()
    if (entrants.length > 0) {
      const { data: fighterRows, error: fighterError } = await db
        .from('fighters')
        .select(PUBLIC_FIGHTER_COLUMNS)
        .in('id', entrants.map((e) => e.fighter_id))

      if (fighterError) throw fighterError
      // Same normalize-on-read as /api/fight: these rows go straight into the
      // sim when this poller is the one that claims the next match.
      fighters = new Map(
        ((fighterRows ?? []) as Fighter[]).map(hydrateFighter).map((f) => [f.id, f]),
      )
    }

    const { data: matchRows, error: matchError } = await db
      .from('matches')
      .select('*')
      .eq('code', code)
      .order('round')
      .order('slot')

    if (matchError) throw matchError
    const matches = (matchRows ?? []) as MatchRow[]

    const status = await advanceRoom(db, room, matches, fighters)

    const now = Date.now()
    const liveRow =
      matches.find((m) => m.starts_at !== null && m.ends_at !== null && Date.parse(m.ends_at) > now) ??
      null

    const finalRound = matches.reduce((n, m) => Math.max(n, m.round), 0)
    const finalMatch = matches.find((m) => m.round === finalRound && m.slot === 0) ?? null
    const championId = status === 'done' ? (finalMatch?.winner ?? null) : null

    const view: RoomView = {
      room: {
        code: room.code,
        status,
        size: room.size,
        rounds: finalRound,
        is_host: sessionId !== null && room.host_session === sessionId,
        created_at: room.created_at,
        expires_at: room.expires_at,
      },
      entrants: entrants.map((e) => {
        const f = fighters.get(e.fighter_id)
        return {
          seat: e.seat,
          fighter_id: e.fighter_id,
          name: f?.name ?? 'Unknown',
          title: f?.title ?? '',
          sprite: f?.sprite ?? null,
          is_you: sessionId !== null && e.session_id === sessionId,
        }
      }),
      // The tree without the logs — one bracket's worth of turn logs is far
      // more than a poll every 1.5s should carry. Only the live match ships its log.
      bracket: matches.map((m) => ({
        round: m.round,
        slot: m.slot,
        a_fighter: m.a_fighter,
        b_fighter: m.b_fighter,
        winner: m.winner,
        bye: (m.a_fighter === null) !== (m.b_fighter === null),
        victory: m.log?.victory ?? null,
        starts_at: m.starts_at,
        ends_at: m.ends_at,
      })),
      live: liveRow
        ? {
            round: liveRow.round,
            slot: liveRow.slot,
            a_fighter: liveRow.a_fighter,
            b_fighter: liveRow.b_fighter,
            bye: (liveRow.a_fighter === null) !== (liveRow.b_fighter === null),
            starts_at: liveRow.starts_at as string,
            ends_at: liveRow.ends_at as string,
            result: liveRow.log,
          }
        : null,
      champion_id: championId,
      // Read once on the client to work out the clock offset; every beat after
      // that is local arithmetic against `starts_at`.
      server_now: new Date().toISOString(),
      beat_ms: BEAT_MS,
    }

    return NextResponse.json(view)
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('room lookup failed:', err)
    return NextResponse.json({ error: 'Something broke in the room.' }, { status: 500 })
  }
}
