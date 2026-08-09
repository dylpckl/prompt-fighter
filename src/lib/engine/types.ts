// Shared vocabulary between the generator, the sim, and the client.
//
// The two enums below are the load-bearing safety property: the model picks
// from this vocabulary, it doesn't invent mechanics. A prompt asking for an
// "instantly wins" ability can only ever land on one of these.

// Type-only, so this doesn't create a runtime cycle with victory.ts.
import type { PressureTrack, VictoryType } from './victory'
import type { Rule } from './rules'

export const MOVE_EFFECTS = ['damage', 'heavy', 'heal', 'guard', 'drain', 'stun'] as const
export const FLAW_EFFECTS = ['glass', 'slow_start', 'stamina', 'wild', 'overheat'] as const

export type MoveEffect = (typeof MOVE_EFFECTS)[number]
export type FlawEffect = (typeof FLAW_EFFECTS)[number]

/**
 * Two separate budgets, deliberately. The body four spend ${STAT_TOTAL} points
 * and the spirit four spend ${SPIRIT_TOTAL}; neither can borrow from the other.
 * Two hard ceilings are a stronger anti-cheat story than one big one, and it
 * leaves the existing physical balance untouched.
 */
export interface Stats {
  // Body budget.
  hp: number
  atk: number
  def: number
  spd: number
  // Spirit budget.
  /** Presence — charisma, rhetoric, stage command, allure. */
  cha: number
  /** Resolve — conviction, stubbornness, sanity. Defends against the other three. */
  wil: number
  /** Weirdness — magic, curses, cosmic static. */
  arc: number
  /** Fate — luck, coincidence, narrative convenience. */
  luk: number
}

export const BODY_KEYS = ['hp', 'atk', 'def', 'spd'] as const
export const SPIRIT_KEYS = ['cha', 'wil', 'arc', 'luk'] as const

export type BodyKey = (typeof BODY_KEYS)[number]
export type SpiritKey = (typeof SPIRIT_KEYS)[number]

/** Just the spirit four. What the pressure meters and their labels read. */
export type SpiritStats = Pick<Stats, SpiritKey>

export interface Move {
  name: string
  power: number
  effect: MoveEffect
}

export interface Flaw {
  name: string
  effect: FlawEffect
}

export interface Sprite {
  /** 8 hex colors. Index 0 is always transparent. */
  palette: string[]
  /** 16 rows of 16 palette-index characters ('0'-'7'). */
  rows: string[]
}

export interface FighterPrompts {
  body: string
  weapon: string
  move: string
  flaw: string
}

/** Everything the sim needs — no id, no win/loss record. */
export interface FighterCore {
  name: string
  stats: Stats
  moves: [Move, Move]
  flaw: Flaw
  /**
   * How many players have this as their one favorite. The sim reads it for the
   * crowd meter and nothing else — see lib/engine/favorites.ts.
   *
   * Optional, and absent means zero: a fixture that predates favorites, or a row
   * read before migration 0005, must simulate exactly as it always did.
   */
  favorites?: number
  /**
   * The part of this fighter that isn't a number — see `lib/engine/rules.ts`.
   *
   * Optional, and absent means none: a fixture written before rules existed, or
   * a row read before migration 0006, must simulate exactly as it always did.
   * A fighter with no rules never draws from the rules RNG stream at all, so
   * "no rules" is bit-identical to "rules didn't exist yet", not merely similar.
   */
  rules?: Rule[]
}

/**
 * What `/api/generate-fighter` hands back before a Special is even chosen: the
 * model's read of the four prompts, already safety-checked and run through the
 * same normalizers a stored fighter gets, but with no id, record, or session
 * attached — and no `prompts`, which never leaves the server (see
 * lib/server/fighters.ts).
 *
 * `rules` here is the *background* set — everything the prompt implies except
 * the one standout idea. `/api/create-fighter` runs it through `assembleRules`
 * with the chosen Special before it ever reaches the database; it is never
 * inserted as-is.
 *
 * `/api/create-fighter` trusts every field on this unmodified — see
 * lib/server/sign.ts. Never spread it into an insert; take fields by name.
 */
export interface Candidate {
  name: string
  title: string
  stats: Stats
  moves: [Move, Move]
  flaw: Flaw
  rules: Rule[]
  sprite: Sprite
}

export interface Fighter extends FighterCore {
  id: string
  title: string
  /**
   * Server-side only. The API never serialises another player's prompts, and
   * nothing in the UI renders them — see lib/server/fighters.ts.
   */
  prompts?: FighterPrompts
  sprite: Sprite
  wins: number
  losses: number
  /**
   * Required here, optional on `FighterCore`. A stored fighter always has a
   * count — `hydrateFighter` fills it in even for rows that predate the column —
   * so the UI never has to guard, while a hand-built sim fixture still doesn't
   * have to mention favorites at all.
   */
  favorites: number
  /**
   * Required here, optional on `FighterCore`, for the same reason `favorites`
   * is: a stored fighter always has a list, even if it's empty.
   */
  rules: Rule[]
}

export type Side = 'a' | 'b'

export interface TurnEvent {
  turn: number
  actor: Side
  move: string
  effect: MoveEffect
  damage: number
  heal: number
  missed: boolean
  /** HP of both sides *after* this action resolves. */
  hp: Record<Side, number>
  /** Pressure meters of both sides *after* this action, rounded, 0..PRESSURE_THRESHOLD. */
  pressure: Record<Side, Record<PressureTrack, number>>
  /** Signature-meter charge of both sides *after* this action resolves. */
  meter: Record<Side, number>
  text: string
  /**
   * Rules that fired on this beat, already rendered as "Name: line".
   *
   * Separate from `text` rather than folded into it, because the two are read by
   * different things: `text` is the physical narration of the action, and this
   * is the only place a player ever sees the rule they asked for actually doing
   * something. The log renders these; nothing renders `text` today.
   */
  rules: string[]
}

export interface SimResult {
  log: TurnEvent[]
  winner: Side
  maxHp: Record<Side, number>
  /**
   * True when the fight went the full distance on HP — nobody knocked out, no
   * meter capped — and the win went to whoever had more health left. A pressure
   * win is neither a KO nor a decision; `pressure` is what signals it.
   */
  decision: boolean
  /** The track the winner capped, or null when HP settled it. */
  pressure: PressureTrack | null
  /** How the win read. Derived from the finished fight; never decides it. */
  victory: VictoryType
}

export interface FightResponse extends SimResult {
  opponent: Fighter
}

export const PROMPT_SLOTS = ['body', 'weapon', 'move', 'flaw'] as const
export const PROMPT_MAX_CHARS = 80
export const STAT_TOTAL = 30
export const STAT_MIN = 3
export const STAT_MAX = 12
export const SPIRIT_TOTAL = 20
export const SPIRIT_MIN = 2
export const SPIRIT_MAX = 10
/** 20/4 — the flat spread old rows get backfilled with. */
export const SPIRIT_DEFAULT = 5
export const SPRITE_SIZE = 16
export const PALETTE_SIZE = 8
/** Actions banked before the signature fires. Mirrors the sim; drives the UI. */
export const METER_TO_SPECIAL = 3
