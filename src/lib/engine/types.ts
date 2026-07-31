// Shared vocabulary between the generator, the sim, and the client.
//
// The two enums below are the load-bearing safety property: the model picks
// from this vocabulary, it doesn't invent mechanics. A prompt asking for an
// "instantly wins" ability can only ever land on one of these.

// Type-only, so this doesn't create a runtime cycle with victory.ts.
import type { PressureTrack, VictoryType } from './victory'

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

/** Everything the sim needs — no id, no record. */
export interface FighterCore {
  name: string
  stats: Stats
  moves: [Move, Move]
  flaw: Flaw
}

export interface Fighter extends FighterCore {
  id: string
  title: string
  /**
   * Only ever present on the server. `hydrateFighter` strips it on the way out
   * along with `session_id`, so anything that came through the API has no
   * prompts on it — see FIGHTER_COLUMNS in validate.ts.
   */
  prompts?: FighterPrompts
  sprite: Sprite
  wins: number
  losses: number
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
  text: string
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
