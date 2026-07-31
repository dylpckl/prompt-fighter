import {
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  PALETTE_SIZE,
  PROMPT_MAX_CHARS,
  PROMPT_SLOTS,
  SPRITE_SIZE,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from './types'
import type { FighterPrompts, Flaw, Move, Sprite, Stats } from './types'

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
 * The stat budget is what stops "my fighter is unbeatable" from meaning
 * anything — the model can move points around, but never add them. We rescale
 * rather than reject so a slightly-off generation still produces a fighter.
 */
export function normalizeStats(input: unknown): Stats {
  const raw = (input ?? {}) as Record<string, unknown>
  const keys = ['hp', 'atk', 'def', 'spd'] as const

  const values = keys.map((k) => {
    const n = Math.round(Number(raw[k]))
    return Number.isFinite(n) ? clamp(n, STAT_MIN, STAT_MAX) : STAT_MIN
  })

  let total = values.reduce((sum, n) => sum + n, 0)

  // Nudge one point at a time toward the budget, skipping stats already pinned.
  let guard = 0
  while (total !== STAT_TOTAL && guard++ < 200) {
    const up = total < STAT_TOTAL
    const candidates = values
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => (up ? v < STAT_MAX : v > STAT_MIN))
    if (candidates.length === 0) break

    // Take from the largest / give to the smallest so the shape survives.
    candidates.sort((x, y) => (up ? x.v - y.v : y.v - x.v))
    values[candidates[0].i] += up ? 1 : -1
    total += up ? 1 : -1
  }

  return { hp: values[0], atk: values[1], def: values[2], spd: values[3] }
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
