import { supabaseAdmin } from '@/lib/server/supabase'
import { simulate } from '@/lib/engine/sim'
import { BYE_MS, matchDurationMs, matchSeed } from '@/lib/engine/bracket'
import type { Fighter, FighterCore, SimResult } from '@/lib/engine/types'

/**
 * Driving the bracket forward, race-free, from whichever poller happens to
 * arrive first.
 *
 * No host, no cron, no lock. Every claim is a conditional UPDATE whose WHERE
 * clause only matches an unclaimed row, so of N simultaneous pollers exactly
 * one writes and the other N-1 get zero rows back and read the result instead.
 * The room keeps running even if the host closes their tab.
 *
 * Everything a loser of that race would have written is identical to what the
 * winner wrote — same fighters, same derived seed, same deterministic sim — so
 * the only thing worth reading back is the timestamps.
 *
 * Nothing in here writes to a fighter's win/loss record. See `startFight`.
 */

type Db = ReturnType<typeof supabaseAdmin>

export type RoomStatus = 'lobby' | 'running' | 'done'

export interface RoomRow {
  code: string
  host_session: string
  /** Hashed client address; the create-room rate limit counts these. */
  host_key: string
  status: RoomStatus
  size: number
  seed: number
  created_at: string
  expires_at: string
}

export interface MatchRow {
  code: string
  round: number
  slot: number
  a_fighter: string | null
  b_fighter: string | null
  winner: string | null
  seed: number | null
  log: SimResult | null
  starts_at: string | null
  ends_at: string | null
}

/**
 * Favorites are carried in because the crowd meter reads them. They are read
 * once, when the match is claimed and simulated — the whole fight is resolved
 * and stored right there, so a favorite arriving while the bracket is on screen
 * lands on the next match rather than rewriting one already playing.
 */
function core(f: Fighter): FighterCore {
  return {
    name: f.name,
    stats: f.stats,
    moves: f.moves,
    flaw: f.flaw,
    favorites: f.favorites,
    rules: f.rules,
  }
}

/**
 * The conditional UPDATE. `starts_at is null` is the claim: it can only be true
 * once, so the update is the lock. A caller that loses re-reads the row.
 */
async function claimMatch(db: Db, match: MatchRow, patch: Partial<MatchRow>): Promise<MatchRow> {
  const { data, error } = await db
    .from('matches')
    .update(patch)
    .eq('code', match.code)
    .eq('round', match.round)
    .eq('slot', match.slot)
    .is('starts_at', null)
    .select()
    .maybeSingle()

  if (error) throw error
  if (data) return data as MatchRow

  const { data: existing, error: readError } = await db
    .from('matches')
    .select('*')
    .eq('code', match.code)
    .eq('round', match.round)
    .eq('slot', match.slot)
    .single()

  if (readError) throw readError
  return existing as MatchRow
}

/** Simulate the whole match up front and stamp it. Beats are pure arithmetic after this. */
async function startFight(
  db: Db,
  room: RoomRow,
  match: MatchRow,
  fighters: Map<string, Fighter>,
): Promise<void> {
  const a = fighters.get(match.a_fighter as string)
  const b = fighters.get(match.b_fighter as string)
  if (!a || !b) throw new Error(`missing fighter for ${room.code} r${match.round}s${match.slot}`)

  // Number() because `seed` is a bigint column; it is always well under 2^31.
  const seed = matchSeed(Number(room.seed), match.round, match.slot)
  const result = simulate(core(a), core(b), seed)
  const winnerId = result.winner === 'a' ? a.id : b.id
  const now = Date.now()

  const row = await claimMatch(db, match, {
    seed,
    log: result,
    winner: winnerId,
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + matchDurationMs(result.log.length)).toISOString(),
  })
  Object.assign(match, row)

  // Deliberately no `record_result` here. Bracket mode is the one place a caller
  // picks *both* sides of a fight, and the public leaderboard ranks on `wins`:
  // opening a room, seating your strong fighter against one you built to lose,
  // and starting it is a guaranteed win you can repeat for as long as you like,
  // with no model call and nothing the server chose. /api/fight is safe from
  // that because `pick_ghost` picks the opponent, which bounds a fighter's
  // record by its actual strength.
  //
  // So the ranking only moves on fights the server matched. A bracket is played
  // for the room it happens in; the champion card is the prize.
}

/** Nobody to fight. Still gets a moment on screen so the bracket doesn't jump. */
async function startBye(db: Db, match: MatchRow): Promise<void> {
  const now = Date.now()
  const row = await claimMatch(db, match, {
    winner: match.a_fighter ?? match.b_fighter,
    starts_at: new Date(now).toISOString(),
    ends_at: new Date(now + BYE_MS).toISOString(),
  })
  Object.assign(match, row)
}

/** Write a finished match's winner into its parent. Idempotent by the same trick. */
async function propagate(db: Db, match: MatchRow, parent: MatchRow): Promise<void> {
  const column = match.slot % 2 === 0 ? 'a_fighter' : 'b_fighter'
  if (parent[column]) return

  const { error } = await db
    .from('matches')
    .update({ [column]: match.winner })
    .eq('code', parent.code)
    .eq('round', parent.round)
    .eq('slot', parent.slot)
    .is(column, null)
    .select()
    .maybeSingle()

  if (error) throw error
  // Whoever won that race wrote the same id we would have, so mirroring it
  // locally is safe and saves the round trip.
  parent[column] = match.winner
}

async function finishRoom(db: Db, room: RoomRow): Promise<RoomStatus> {
  const { error } = await db
    .from('rooms')
    .update({ status: 'done' })
    .eq('code', room.code)
    .eq('status', 'running')

  if (error) throw error
  room.status = 'done'
  return 'done'
}

/**
 * One forward pass over the bracket in (round, slot) order. Because feeders
 * always sort before the match they feed, a single pass is enough: by the time
 * we reach a later match its winners are already in place.
 *
 * `matches` is mutated in place so the caller can render straight from it.
 */
export async function advanceRoom(
  db: Db,
  room: RoomRow,
  matches: MatchRow[],
  fighters: Map<string, Fighter>,
): Promise<RoomStatus> {
  if (room.status !== 'running') return room.status

  const ordered = [...matches].sort((x, y) => x.round - y.round || x.slot - y.slot)
  const byKey = new Map(ordered.map((m) => [`${m.round}:${m.slot}`, m]))

  for (const match of ordered) {
    if (match.starts_at === null) {
      // Both empty means the round below is still playing; nothing to do here.
      if (!match.a_fighter && !match.b_fighter) return room.status

      if (!match.a_fighter || !match.b_fighter) await startBye(db, match)
      else await startFight(db, room, match, fighters)
    }

    // Still on screen somewhere. Stop — the bracket only ever runs one at a time.
    if (match.ends_at && Date.now() < Date.parse(match.ends_at)) return room.status

    const parent = byKey.get(`${match.round + 1}:${Math.floor(match.slot / 2)}`)
    if (!parent) return finishRoom(db, room)
    await propagate(db, match, parent)
  }

  return room.status
}
