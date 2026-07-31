// Shared vocabulary between the generator, the sim, and the client.
//
// The two enums below are the load-bearing safety property: the model picks
// from this vocabulary, it doesn't invent mechanics. A prompt asking for an
// "instantly wins" ability can only ever land on one of these.

export const MOVE_EFFECTS = ['damage', 'heavy', 'heal', 'guard', 'drain', 'stun'] as const
export const FLAW_EFFECTS = ['glass', 'slow_start', 'stamina', 'wild', 'overheat'] as const

export type MoveEffect = (typeof MOVE_EFFECTS)[number]
export type FlawEffect = (typeof FLAW_EFFECTS)[number]

export interface Stats {
  hp: number
  atk: number
  def: number
  spd: number
}

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
   * Server-side only. The API never serialises another player's prompts, and
   * nothing in the UI renders them — see lib/server/fighters.ts.
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
  /** Signature-meter charge of both sides *after* this action resolves. */
  meter: Record<Side, number>
  text: string
}

export interface SimResult {
  log: TurnEvent[]
  winner: Side
  maxHp: Record<Side, number>
  /** True when nobody was knocked out and the win went to remaining HP. */
  decision: boolean
}

export interface FightResponse extends SimResult {
  opponent: Fighter
}

export const PROMPT_SLOTS = ['body', 'weapon', 'move', 'flaw'] as const
export const PROMPT_MAX_CHARS = 80
export const STAT_TOTAL = 30
export const STAT_MIN = 3
export const STAT_MAX = 12
export const SPRITE_SIZE = 16
export const PALETTE_SIZE = 8
/** Actions banked before the signature fires. Mirrors the sim; drives the UI. */
export const METER_TO_SPECIAL = 3
