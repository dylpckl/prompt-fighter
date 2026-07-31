// Bracket seeding, pairing and playback timing — all pure, all deterministic.
//
// Bracket mode has no push channel and no websocket. A match is simulated in
// full the instant it starts and stamped with `starts_at`, so every viewer
// derives the current beat from arithmetic alone:
//
//   beat = floor((serverNow - startsAt) / BEAT_MS)
//
// Same log + same timestamp + same arithmetic on every client = frame-synced
// viewers. That is the whole reason the browser still needs no credentials.
//
// Every random draw here takes its own stream seeded off the room seed, per the
// rule victory.ts sets: nothing in this file may ever consume from a sim rng,
// because that would shift every subsequent roll and rewrite finished fights.

import { makeRng } from './rng'
import { ValidationError } from './validate'

/** One log entry per beat, matching the Arena replay's pacing. */
export const BEAT_MS = 1050
/** Hold on the victory banner after the last beat, before the next match. */
export const OUTRO_MS = 3500
/** A bye still gets a moment on screen, or fighters teleport up the bracket. */
export const BYE_MS = 1800
/** How often a viewer should re-GET the room. Only ever learns "next match". */
export const POLL_MS = 1500

export const ROOM_SIZES = [4, 8, 16] as const
export type RoomSize = (typeof ROOM_SIZES)[number]

export const ROOM_CODE_LENGTH = 4
/**
 * 32 characters with O/0 and I/1 removed. Codes get read aloud across a room,
 * so the ambiguous pairs cost more than the entropy they add: 32^4 is still
 * ~1M codes against at most a few thousand live rooms.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Salts, so the shuffle and each match seed draw from unrelated streams. */
const SHUFFLE_SALT = 0x7a3c9e11
const MATCH_ROUND_SALT = 0x9e3779b1
const MATCH_SLOT_SALT = 0x85ebca6b

export interface Pairing {
  slot: number
  /** Fighter id, or null for an empty bracket position (a bye for the other). */
  a: string | null
  b: string | null
}

/** How long a whole match occupies the screen, from `starts_at`. */
export function matchDurationMs(logLength: number): number {
  return logLength * BEAT_MS + OUTRO_MS
}

/** `pick(max)` must return an integer in [0, max). */
export function roomCodeFrom(pick: (max: number) => number): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

/** Room codes come off a URL segment, so they reach a query like any other input. */
export function parseRoomCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (code.length !== ROOM_CODE_LENGTH) throw new ValidationError('Invalid room code.')
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) throw new ValidationError('Invalid room code.')
  }
  return code
}

export function parseRoomSize(value: unknown): RoomSize {
  const n = Math.round(Number(value))
  if (!ROOM_SIZES.includes(n as RoomSize)) {
    throw new ValidationError(`Room size must be one of ${ROOM_SIZES.join(', ')}.`)
  }
  return n as RoomSize
}

/** Smallest power of two that holds `count` entrants. Never below 2. */
export function bracketSize(count: number): number {
  let size = 2
  while (size < count) size *= 2
  return size
}

export function roundsFor(size: number): number {
  return Math.round(Math.log2(size))
}

/**
 * Classic tournament ordering — 1v8, 4v5, 2v7, 3v6 for a size of 8.
 *
 * Seeds here are positions, not strength; the entrant list is already shuffled.
 * The property that matters is that it pairs the top half against the bottom
 * half in reverse, so when the field is short the byes land on distinct
 * matches instead of stacking up in one corner. A 5-person room gets three
 * separate byes, which is what makes it playable at all.
 */
export function standardSeedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2
    const next: number[] = []
    for (const seed of order) next.push(seed, n + 1 - seed)
    order = next
  }
  return order
}

/** Fisher-Yates on its own stream, so the draw is replayable from the room seed. */
export function shuffleSeats<T>(items: readonly T[], seed: number): T[] {
  const rng = makeRng(seed ^ SHUFFLE_SALT)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Per-match seed. Derived from the room seed rather than drawn fresh, so a
 * finished bracket can be re-simulated and audited exactly like a solo fight.
 */
export function matchSeed(roomSeed: number, round: number, slot: number): number {
  const mixed =
    ((roomSeed >>> 0) ^ Math.imul(round, MATCH_ROUND_SALT) ^ Math.imul(slot, MATCH_SLOT_SALT)) >>> 0
  return Math.floor(makeRng(mixed)() * 2 ** 31)
}

/**
 * Shuffle the field, pad to a power of two with empty positions, and pair off
 * round one. Later rounds are created empty and filled in as winners arrive.
 */
export function buildFirstRound(
  entrantIds: readonly string[],
  seed: number,
): { size: number; rounds: number; pairings: Pairing[] } {
  const shuffled = shuffleSeats(entrantIds, seed)
  const size = bracketSize(shuffled.length)
  const order = standardSeedOrder(size)
  const positions = order.map((position) => shuffled[position - 1] ?? null)

  const pairings: Pairing[] = []
  for (let slot = 0; slot < size / 2; slot++) {
    pairings.push({ slot, a: positions[slot * 2], b: positions[slot * 2 + 1] })
  }

  return { size, rounds: roundsFor(size), pairings }
}
