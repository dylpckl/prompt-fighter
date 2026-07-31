import {
  BODY_KEYS,
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  PALETTE_SIZE,
  PROMPT_MAX_CHARS,
  PROMPT_SLOTS,
  SPIRIT_DEFAULT,
  SPIRIT_KEYS,
  SPIRIT_MAX,
  SPIRIT_MIN,
  SPIRIT_TOTAL,
  SPRITE_SIZE,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from './types'
import type { Fighter, FighterPrompts, Flaw, Move, Sprite, Stats } from './types'

export class ValidationError extends Error {}

/** Session and fighter ids are client-supplied — not secrets, but they reach a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ValidationError(`Invalid ${label}.`)
  }
  return value.toLowerCase()
}

export function parsePrompts(input: unknown): FighterPrompts {
  if (!input || typeof input !== 'object') throw new ValidationError('Missing prompts.')
  const raw = input as Record<string, unknown>
  const out = {} as FighterPrompts

  for (const slot of PROMPT_SLOTS) {
    const value = raw[slot]
    if (typeof value !== 'string') throw new ValidationError(`"${slot}" is required.`)
    const trimmed = value.trim()
    if (!trimmed) throw new ValidationError(`"${slot}" can't be empty.`)
    if (trimmed.length > PROMPT_MAX_CHARS) {
      throw new ValidationError(`"${slot}" is over ${PROMPT_MAX_CHARS} characters.`)
    }
    out[slot] = trimmed
  }
  return out
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Pull four keys out of raw input and force them onto a budget.
 *
 * `fallback` is what a missing or unreadable key becomes before clamping. The
 * body budget uses the floor (a junk stat should cost you), while the spirit
 * budget uses its flat share, so a fighter row written before spirit stats
 * existed reads back as a legal 5/5/5/5 instead of being dragged off shape.
 */
function normalizeBudget(
  raw: Record<string, unknown>,
  keys: readonly string[],
  { min, max, total: budget, fallback }: { min: number; max: number; total: number; fallback: number },
): number[] {
  const values = keys.map((k) => {
    const value = raw[k]
    if (value === undefined || value === null) return clamp(fallback, min, max)
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? clamp(n, min, max) : fallback
  })

  let total = values.reduce((sum, n) => sum + n, 0)

  // Nudge one point at a time toward the budget, skipping stats already pinned.
  let guard = 0
  while (total !== budget && guard++ < 200) {
    const up = total < budget
    const candidates = values.map((v, i) => ({ v, i })).filter(({ v }) => (up ? v < max : v > min))
    if (candidates.length === 0) break

    // Take from the largest / give to the smallest so the shape survives.
    candidates.sort((x, y) => (up ? x.v - y.v : y.v - x.v))
    values[candidates[0].i] += up ? 1 : -1
    total += up ? 1 : -1
  }

  return values
}

/**
 * The stat budgets are what stop "my fighter is unbeatable" from meaning
 * anything — the model can move points around, but never add them. We rescale
 * rather than reject so a slightly-off generation still produces a fighter.
 *
 * Body and spirit are normalized independently: overspending one can never
 * quietly fund the other, and the physical balance is exactly what it always
 * was. Fighters stored before spirit stats existed come back with a flat
 * spread rather than an error.
 */
export function normalizeStats(input: unknown): Stats {
  const raw = (input ?? {}) as Record<string, unknown>

  const body = normalizeBudget(raw, BODY_KEYS, {
    min: STAT_MIN,
    max: STAT_MAX,
    total: STAT_TOTAL,
    fallback: STAT_MIN,
  })
  const spirit = normalizeBudget(raw, SPIRIT_KEYS, {
    min: SPIRIT_MIN,
    max: SPIRIT_MAX,
    total: SPIRIT_TOTAL,
    fallback: SPIRIT_DEFAULT,
  })

  return {
    hp: body[0],
    atk: body[1],
    def: body[2],
    spd: body[3],
    cha: spirit[0],
    wil: spirit[1],
    arc: spirit[2],
    luk: spirit[3],
  }
}

/**
 * The columns a fighter row is allowed to be selected with.
 *
 * `session_id` is conspicuously absent, and that is the point. It is the app's
 * only authorization token — /api/fight and the room join check both prove
 * ownership with a plain `.eq('session_id', …)` — while fighter *ids* are
 * public by design: /api/leaderboard publishes the top 25 and the room GET
 * publishes every entrant. Shipping the token next to the id it protects would
 * let anyone enter, and then drive the record of, somebody else's fighter.
 *
 * `prompts` goes too. It is the author's raw text, nothing renders it, and a
 * payload nobody reads is a payload that can't leak.
 */
export const FIGHTER_COLUMNS =
  'id, name, title, stats, moves, flaw, sprite, wins, losses, created_at'

/** Keys that must never reach a response, whatever the query asked for. */
const PRIVATE_FIGHTER_KEYS = ['session_id', 'prompts'] as const

/**
 * A fighter row on the way *out* of the database: stripped, then normalized.
 *
 * The strip is belt to FIGHTER_COLUMNS' braces, and it is not redundant —
 * `pick_ghost` returns `setof public.fighters`, so an RPC result arrives with
 * every column on it and cannot be projected at the query. One function on the
 * way out means one place to get it right.
 *
 * Stats are normalized on write, so for anything created since the spirit
 * budget existed that half is a no-op — both budgets are idempotent once they
 * are on-budget. It earns its place on the older rows, which have only the body
 * four stored. The sim already treats a missing spirit key as ${SPIRIT_DEFAULT}
 * so that it can't produce NaN, and without this the stat panel would draw four
 * empty bars for the exact values the fight was decided on. Normalizing here
 * means what the player is shown and what the sim read are the same numbers,
 * whether or not migration 0003 has been applied yet.
 */
export function hydrateFighter(row: unknown): Fighter {
  const raw = { ...((row ?? {}) as Fighter) }
  for (const key of PRIVATE_FIGHTER_KEYS) delete (raw as Record<string, unknown>)[key]
  return { ...raw, stats: normalizeStats(raw.stats) }
}

function cleanName(input: unknown, fallback: string, maxChars: number): string {
  const s = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : ''
  if (!s) return fallback
  return s.slice(0, maxChars)
}

export function normalizeMove(input: unknown, kind: 'basic' | 'special'): Move {
  const raw = (input ?? {}) as Record<string, unknown>
  const [minPower, maxPower] = kind === 'basic' ? [3, 6] : [6, 10]
  const power = Math.round(Number(raw.power))

  const effect = MOVE_EFFECTS.includes(raw.effect as never)
    ? (raw.effect as Move['effect'])
    : 'damage'

  return {
    name: cleanName(raw.name, kind === 'basic' ? 'Strike' : 'Finisher', 24),
    power: Number.isFinite(power) ? clamp(power, minPower, maxPower) : minPower,
    effect,
  }
}

export function normalizeFlaw(input: unknown): Flaw {
  const raw = (input ?? {}) as Record<string, unknown>
  return {
    name: cleanName(raw.name, 'Weakness', 24),
    effect: FLAW_EFFECTS.includes(raw.effect as never) ? (raw.effect as Flaw['effect']) : 'glass',
  }
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Coerce whatever came back into exactly 16 rows of 16 indices and 8 colors.
 * A sprite that's slightly wrong should still draw; only a totally empty one
 * is worth failing over.
 */
export function normalizeSprite(paletteInput: unknown, rowsInput: unknown): Sprite {
  const rawPalette = Array.isArray(paletteInput) ? paletteInput : []
  const palette: string[] = []
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const c = rawPalette[i]
    palette.push(typeof c === 'string' && HEX.test(c.trim()) ? c.trim().toLowerCase() : '#000000')
  }

  const rawRows = Array.isArray(rowsInput) ? rowsInput : []
  const rows: string[] = []
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const source = typeof rawRows[y] === 'string' ? (rawRows[y] as string) : ''
    let row = ''
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const ch = source[x]
      row += ch && ch >= '0' && ch <= '7' ? ch : '0'
    }
    rows.push(row)
  }

  const filled = rows.join('').split('').filter((c) => c !== '0').length
  if (filled < 12) throw new ValidationError('The sprite came back empty. Try again.')

  return { palette, rows }
}
