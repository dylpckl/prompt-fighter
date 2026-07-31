import type { Fighter, FighterPrompts, SimResult, Sprite } from '@/lib/engine/types'
import type { VictoryType } from '@/lib/engine/victory'

export interface FightResult extends SimResult {
  opponent: Fighter
  seed: number
}

/** What the roster needs to draw a row — not the whole fighter. */
export interface RosterEntry {
  id: string
  name: string
  title: string
  sprite: Sprite
  wins: number
  losses: number
  /** How many players hold this as their one favorite. */
  favorites: number
  /** Present on the roster, absent on the leaderboard — neither view shows it. */
  created_at?: string
}

/**
 * Everything is same-origin now, so there are no keys, no CORS, and no base
 * URL to configure — the browser never talks to Supabase directly.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = payload as { error?: string } | null
    throw new Error(detail?.error ?? `Request failed (${res.status})`)
  }
  return payload as T
}

export function createFighter(
  sessionId: string,
  prompts: FighterPrompts,
): Promise<{ fighter: Fighter }> {
  return request('/api/create-fighter', {
    method: 'POST',
    body: JSON.stringify({ sessionId, prompts }),
  })
}

export function requestFight(sessionId: string, fighterId: string): Promise<FightResult> {
  return request('/api/fight', {
    method: 'POST',
    body: JSON.stringify({ sessionId, fighterId }),
  })
}

export function fetchMyFighters(sessionId: string): Promise<{ fighters: RosterEntry[] }> {
  return request(`/api/fighters?sessionId=${encodeURIComponent(sessionId)}`)
}

/** Ranked across the whole pool, not just this session. */
export function fetchLeaderboard(): Promise<{ fighters: RosterEntry[] }> {
  return request('/api/leaderboard')
}

export async function fetchFighter(id: string): Promise<Fighter | null> {
  try {
    const { fighter } = await request<{ fighter: Fighter }>(`/api/fighter/${encodeURIComponent(id)}`)
    return fighter
  } catch {
    return null
  }
}

// --- Favorites -------------------------------------------------------------
//
// One per player, and it feeds the crowd meter — see lib/engine/favorites.ts.
// The server owns the "one" part; nothing here enforces it, because a client
// that decided not to would just get the same single row moved around anyway.

/** Which fighter this player currently backs, or null. */
export function fetchMyFavorite(sessionId: string): Promise<{ fighterId: string | null }> {
  return request(`/api/favorite?sessionId=${encodeURIComponent(sessionId)}`)
}

/** Moves the player's one favorite. Rejects their own fighters. */
export function setFavorite(
  sessionId: string,
  fighterId: string,
): Promise<{ fighterId: string; favorites: number }> {
  return request('/api/favorite', {
    method: 'POST',
    body: JSON.stringify({ sessionId, fighterId }),
  })
}

/** Takes it back. A no-op if they weren't backing anyone. */
export function clearFavorite(sessionId: string): Promise<{ cleared: boolean }> {
  return request('/api/favorite', {
    method: 'DELETE',
    body: JSON.stringify({ sessionId }),
  })
}

// --- Bracket mode ----------------------------------------------------------
//
// Field names are snake_case because they mirror the columns, exactly like the
// fighter rows the other endpoints return. Timestamps are ISO strings.

export type RoomStatus = 'lobby' | 'running' | 'done'

/** A seat in the lobby, with everything needed to draw it. */
export interface RoomEntrant {
  seat: number
  fighter_id: string
  name: string
  title: string
  /** Null only if the fighter row has gone missing under us. */
  sprite: Sprite | null
  /** True for the seat belonging to the polling session. */
  is_you: boolean
}

/** One node of the tree. Deliberately carries no turn log — see `live`. */
export interface BracketMatch {
  /** 1-indexed. Round `rounds` is the final. */
  round: number
  /** 0-indexed within the round. Winners feed round+1, slot floor(slot/2). */
  slot: number
  a_fighter: string | null
  b_fighter: string | null
  winner: string | null
  /** Exactly one side present: the other walks through without a fight. */
  bye: boolean
  /** Set once the match has been played. */
  victory: VictoryType | null
  starts_at: string | null
  ends_at: string | null
}

/**
 * The match currently on screen. Everyone gets the same log and the same
 * `starts_at`, so everyone renders the same beat:
 *
 *   beat = Math.floor((serverNow - Date.parse(starts_at)) / beat_ms)
 *
 * where `serverNow` is the local clock plus the offset derived once from
 * `server_now`. No push channel involved.
 */
export interface LiveMatch {
  round: number
  slot: number
  a_fighter: string | null
  b_fighter: string | null
  bye: boolean
  starts_at: string
  ends_at: string
  /** Null for a bye — nobody fought. `a` is the fighter in `a_fighter`. */
  result: SimResult | null
}

export interface RoomView {
  room: {
    code: string
    status: RoomStatus
    /** Seats on offer, not the bracket size — the bracket fits whoever showed up. */
    size: number
    /** Rounds in the drawn bracket. 0 while still in the lobby. */
    rounds: number
    /** Only true when the polling session opened the room. */
    is_host: boolean
    created_at: string
    expires_at: string
  }
  entrants: RoomEntrant[]
  bracket: BracketMatch[]
  live: LiveMatch | null
  /** Fighter id, set once the room is 'done'. */
  champion_id: string | null
  /** Sample once against the local clock to get an offset; then never again. */
  server_now: string
  beat_ms: number
}

export function createRoom(sessionId: string, size: number): Promise<{ code: string }> {
  return request('/api/room', {
    method: 'POST',
    body: JSON.stringify({ sessionId, size }),
  })
}

export function joinRoom(
  code: string,
  sessionId: string,
  fighterId: string,
): Promise<{ seat: number }> {
  return request(`/api/room/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, fighterId }),
  })
}

/** Host only. Draws the bracket and starts match one. */
export function startRoom(
  code: string,
  sessionId: string,
): Promise<{ started: true; size: number; rounds: number }> {
  return request(`/api/room/${encodeURIComponent(code)}/start`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  })
}

/**
 * The whole room in one call — poll it every `POLL_MS`. Passing the session id
 * is what fills in `is_host` and `is_you`; it is optional for a pure spectator.
 */
export function fetchRoom(code: string, sessionId?: string): Promise<RoomView> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
  return request(`/api/room/${encodeURIComponent(code)}${query}`)
}
