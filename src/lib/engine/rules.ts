// Rules — the part of a fighter that isn't a number.
//
// The four stat/move/flaw fields answer "which of our verbs is your idea?", and
// that question has a fixed number of answers. Rules ask a different one: "when
// does your idea happen, and what does it do?" The vocabulary below is still
// closed — a fighter can't invent a mechanic — but a fighter carries up to
// ${MAX_RULES} of these at once and picks its own numbers, so the space of
// fighters is combinatorial rather than enumerable. "Immune to damage until
// someone says grandmother" and "gets stronger every time he misses" are the
// same two-part sentence with different words in it.
//
// There is deliberately no budget here. Stats are capped because a stat line is
// permanent and moves a win/loss record; rules are not capped because the point
// of this system is that a player gets the fighter they described, including
// when what they described is unfair. Whatever happens happens.
//
// The one invariant that is not negotiable:
//
//   A FIGHT ALWAYS ENDS.
//
// Everything below is written to keep that true no matter what the generator
// emits. Three properties, together, are what guarantee it:
//
//   1. Rules fire only from sim hooks, never from other rules. There is no
//      cascade, so the work per beat is bounded by MAX_RULES and nothing a rule
//      does can schedule more rule evaluation.
//   2. No action can extend the fight. Nothing here touches the round counter,
//      so `MAX_ACTIONS_PER_SIDE` in sim.ts is an absolute ceiling on beats even
//      if both fighters are immortal and revive forever.
//   3. Every action is total. Values are clamped on the way in, the switch is
//      exhaustive, and no branch can throw — a rule that makes no sense is a
//      rule that does nothing, not a 500.
//
// See tests/rules.test.ts, which asserts (1)-(3) against adversarial fighters
// built specifically to run forever.

import { chance as rollChance } from './rng'
import { MOVE_EFFECTS } from './types'
import type { MoveEffect } from './types'
import { PRESSURE_TRACKS } from './victory'
import type { PressureTrack } from './victory'

/**
 * When a rule fires.
 *
 * Each one is pinned to a hook the sim actually calls — adding a trigger means
 * adding or reusing a hook, which is the check that stops this list drifting
 * into things the engine has no moment for.
 */
export const RULE_TRIGGERS = [
  // --- hook: 'start', once, before the first beat -------------------------
  'fight_start',
  // --- hook: 'turn', at the top of the owner's action ---------------------
  'my_turn',
  'always',
  'coin_flip',
  'first_turns',
  'after_turn',
  'every_other_turn',
  'my_hp_below',
  'my_hp_above',
  'their_hp_below',
  'my_meter_full',
  'their_turn',
  // --- hook: 'attack', after the owner picks a move -----------------------
  'when_i_attack',
  'when_i_use_signature',
  // --- hook: 'incoming', on the defender, before damage lands -------------
  'when_i_am_hit',
  'when_they_use',
  // --- hook: 'resolved', after the owner's action settles -----------------
  'when_i_land',
  'when_i_miss',
  // --- hook: 'fall', when someone hits zero -------------------------------
  'when_i_would_fall',
  'when_they_would_fall',
] as const

/**
 * What a rule does.
 *
 * Split into two kinds by how the sim consumes them. *Modifiers* only mean
 * anything at the hook that reads them — `damage_taken_mult` is gathered as a
 * product at 'incoming' and multiplied into that one hit. *Effects* apply the
 * moment they fire and persist. The distinction matters because a modifier
 * fired at the wrong hook is silently inert, which is a much better failure than
 * a modifier that leaks into every future hit.
 */
export const RULE_ACTIONS = [
  // Modifiers — read at the hook that gathers them.
  'immune',
  'damage_taken_mult',
  'damage_dealt_mult',
  'reflect',
  // Effects — applied on the spot.
  'heal_self',
  'heal_pct',
  'hurt_self',
  'hurt_them',
  'steal_hp',
  'revive',
  'stun_them',
  'skip_my_turn',
  'guard',
  'charge_meter',
  'boost_atk',
  'boost_def',
  'boost_spd',
  'pressure_add',
  'pressure_mult',
  'silence_them',
  'win_now',
] as const

export type RuleTrigger = (typeof RULE_TRIGGERS)[number]
export type RuleAction = (typeof RULE_ACTIONS)[number]

/** Which hook each trigger is evaluated at. Exhaustive by construction. */
export const TRIGGER_HOOK: Record<RuleTrigger, RuleHook> = {
  fight_start: 'start',
  my_turn: 'turn',
  always: 'turn',
  coin_flip: 'turn',
  first_turns: 'turn',
  after_turn: 'turn',
  every_other_turn: 'turn',
  my_hp_below: 'turn',
  my_hp_above: 'turn',
  their_hp_below: 'turn',
  my_meter_full: 'turn',
  their_turn: 'turn',
  when_i_attack: 'attack',
  when_i_use_signature: 'attack',
  when_i_am_hit: 'incoming',
  when_they_use: 'incoming',
  when_i_land: 'resolved',
  when_i_miss: 'resolved',
  when_i_would_fall: 'fall',
  when_they_would_fall: 'fall',
}

export type RuleHook = 'start' | 'turn' | 'attack' | 'incoming' | 'resolved' | 'fall'

export interface RuleWhen {
  on: RuleTrigger
  /** Threshold for the triggers that take one — a turn number or an HP percent. */
  value: number
  /** Only for `when_they_use`. */
  effect?: MoveEffect
}

export interface RuleThen {
  do: RuleAction
  /** Magnitude. Meaning depends on the action; see `describeRule`. */
  value: number
  /** Only for the two pressure actions. */
  track?: PressureTrack
}

export interface Rule {
  /** The model's name for it. This is what the log prints when it fires. */
  name: string
  /** One line of flavour, printed under the name. */
  text: string
  when: RuleWhen
  then: RuleThen
  /** Percent chance it fires when its trigger matches. 100 is always. */
  chance: number
  /** How many times it may ever fire. 0 is unlimited. */
  times: number
}

/**
 * A fighter carries at most this many. The cap is about legibility, not safety —
 * termination holds at any number — but a fight nobody can follow isn't funny,
 * and six is already more than most descriptions ask for.
 */
export const MAX_RULES = 6

/** Longest a rule's name / flavour line may be. Both reach the UI. */
export const RULE_NAME_MAX = 28
export const RULE_TEXT_MAX = 90

/** Salt for the rules' own RNG stream. See `simulate`. */
export const RULES_SALT = 0x9e3779b9

// ---------------------------------------------------------------------------
// Normalization — the generator proposes, this disposes.
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? clamp(n, min, max) : fallback
}

function text(value: unknown, fallback: string, max: number): string {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return (s || fallback).slice(0, max)
}

/**
 * Bounds for each action's `value`, and what it means when absent.
 *
 * These are not balance. They are the range in which the number still *means*
 * something to the engine: a `damage_taken_mult` of -3 isn't a stronger fighter,
 * it's healing on every hit expressed by accident, and a `heal_self` of 10^9 is
 * indistinguishable from 999 because the HP pool is bounded anyway. Clamping
 * here is what makes every action total.
 */
const ACTION_VALUE: Record<RuleAction, { min: number; max: number; fallback: number }> = {
  immune: { min: 0, max: 0, fallback: 0 },
  damage_taken_mult: { min: 0, max: 10, fallback: 1 },
  damage_dealt_mult: { min: 0, max: 10, fallback: 1 },
  reflect: { min: 0, max: 300, fallback: 50 },
  heal_self: { min: 0, max: 999, fallback: 10 },
  heal_pct: { min: 0, max: 100, fallback: 25 },
  hurt_self: { min: 0, max: 999, fallback: 5 },
  hurt_them: { min: 0, max: 999, fallback: 5 },
  steal_hp: { min: 0, max: 999, fallback: 8 },
  revive: { min: 1, max: 100, fallback: 30 },
  stun_them: { min: 0, max: 0, fallback: 0 },
  skip_my_turn: { min: 0, max: 0, fallback: 0 },
  guard: { min: 0, max: 0, fallback: 0 },
  charge_meter: { min: 0, max: 9, fallback: 1 },
  boost_atk: { min: -12, max: 12, fallback: 2 },
  boost_def: { min: -12, max: 12, fallback: 2 },
  boost_spd: { min: -12, max: 12, fallback: 2 },
  pressure_add: { min: -100, max: 100, fallback: 15 },
  pressure_mult: { min: 0, max: 10, fallback: 2 },
  silence_them: { min: 0, max: 0, fallback: 0 },
  win_now: { min: 0, max: 0, fallback: 0 },
}

/** Bounds for each trigger's threshold. Same reasoning as above. */
const TRIGGER_VALUE: Record<RuleTrigger, { min: number; max: number; fallback: number }> = {
  fight_start: { min: 0, max: 0, fallback: 0 },
  my_turn: { min: 0, max: 0, fallback: 0 },
  always: { min: 0, max: 0, fallback: 0 },
  coin_flip: { min: 1, max: 100, fallback: 50 },
  first_turns: { min: 1, max: 14, fallback: 3 },
  after_turn: { min: 1, max: 14, fallback: 3 },
  every_other_turn: { min: 2, max: 9, fallback: 2 },
  my_hp_below: { min: 1, max: 100, fallback: 30 },
  my_hp_above: { min: 0, max: 99, fallback: 50 },
  their_hp_below: { min: 1, max: 100, fallback: 30 },
  my_meter_full: { min: 0, max: 0, fallback: 0 },
  their_turn: { min: 0, max: 0, fallback: 0 },
  when_i_attack: { min: 0, max: 0, fallback: 0 },
  when_i_use_signature: { min: 0, max: 0, fallback: 0 },
  when_i_am_hit: { min: 0, max: 0, fallback: 0 },
  when_they_use: { min: 0, max: 0, fallback: 0 },
  when_i_land: { min: 0, max: 0, fallback: 0 },
  when_i_miss: { min: 0, max: 0, fallback: 0 },
  when_i_would_fall: { min: 0, max: 0, fallback: 0 },
  when_they_would_fall: { min: 0, max: 0, fallback: 0 },
}

function normalizeRule(input: unknown): Rule | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>

  const whenRaw = (raw.when ?? {}) as Record<string, unknown>
  const thenRaw = (raw.then ?? {}) as Record<string, unknown>

  // An unrecognised trigger or action is the one thing worth dropping the whole
  // rule over: there is no sensible default for "what did you mean", and a rule
  // silently rewritten to `always → guard` is a lie about the fighter.
  const on = whenRaw.on as RuleTrigger
  const act = thenRaw.do as RuleAction
  if (!RULE_TRIGGERS.includes(on)) return null
  if (!RULE_ACTIONS.includes(act)) return null

  const tv = TRIGGER_VALUE[on]
  const av = ACTION_VALUE[act]

  const when: RuleWhen = {
    on,
    value: Math.round(num(whenRaw.value, tv.fallback, tv.min, tv.max)),
  }
  if (on === 'when_they_use') {
    when.effect = MOVE_EFFECTS.includes(whenRaw.effect as never)
      ? (whenRaw.effect as MoveEffect)
      : 'damage'
  }

  // Multipliers keep a decimal; everything else is a whole number, because half
  // a point of HP or a fractional stun reads as a bug in the log.
  const isMult = act === 'damage_taken_mult' || act === 'damage_dealt_mult' || act === 'pressure_mult'
  const rawValue = num(thenRaw.value, av.fallback, av.min, av.max)

  const then: RuleThen = { do: act, value: isMult ? rawValue : Math.round(rawValue) }
  if (act === 'pressure_add' || act === 'pressure_mult') {
    then.track = PRESSURE_TRACKS.includes(thenRaw.track as never)
      ? (thenRaw.track as PressureTrack)
      : 'hex'
  }

  return {
    name: text(raw.name, 'Something', RULE_NAME_MAX),
    text: text(raw.text, '', RULE_TEXT_MAX),
    when,
    then,
    chance: Math.round(num(raw.chance, 100, 1, 100)),
    times: Math.round(num(raw.times, 0, 0, 99)),
  }
}

/**
 * A fighter's rules on the way in or out. Never throws and never returns
 * anything the interpreter can't execute: unknown rules are dropped, everything
 * else is clamped into range, and the list is truncated to `MAX_RULES`.
 *
 * Fighters written before rules existed have none, which reads back as `[]` and
 * simulates exactly as they always did.
 */
export function normalizeRules(input: unknown): Rule[] {
  if (!Array.isArray(input)) return []
  const out: Rule[] = []
  for (const item of input) {
    const rule = normalizeRule(item)
    if (rule) out.push(rule)
    if (out.length >= MAX_RULES) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Plain English — same job as lib/explain.ts, but per-instance.
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${Math.round(n)}%`
}

function whenText(when: RuleWhen): string {
  switch (when.on) {
    case 'fight_start':
      return 'At the bell'
    case 'my_turn':
    case 'always':
      return 'On every one of their actions'
    case 'coin_flip':
      return `On each of their actions, ${pct(when.value)} of the time`
    case 'first_turns':
      return `For their first ${when.value} actions`
    case 'after_turn':
      return `From their action ${when.value} onward`
    case 'every_other_turn':
      return `Every ${when.value} actions`
    case 'my_hp_below':
      return `While below ${pct(when.value)} health`
    case 'my_hp_above':
      return `While above ${pct(when.value)} health`
    case 'their_hp_below':
      return `While the opponent is below ${pct(when.value)} health`
    case 'my_meter_full':
      return 'Whenever their signature is charged'
    case 'their_turn':
      return "On every one of the opponent's actions"
    case 'when_i_attack':
      return 'Whenever they attack'
    case 'when_i_use_signature':
      return 'Whenever they fire their signature'
    case 'when_i_am_hit':
      return 'Whenever a hit lands on them'
    case 'when_they_use':
      return `Whenever the opponent uses a ${when.effect} move`
    case 'when_i_land':
      return 'Whenever their attack connects'
    case 'when_i_miss':
      return 'Whenever they miss'
    case 'when_i_would_fall':
      return 'The moment they would drop'
    case 'when_they_would_fall':
      return 'The moment the opponent would drop'
  }
}

function thenText(then: RuleThen): string {
  const track = then.track ?? 'hex'
  switch (then.do) {
    case 'immune':
      return 'the hit does nothing at all'
    case 'damage_taken_mult':
      return then.value === 0
        ? 'the hit does nothing at all'
        : `they take ${then.value}× damage`
    case 'damage_dealt_mult':
      return `they deal ${then.value}× damage`
    case 'reflect':
      return `${pct(then.value)} of the damage goes back at the attacker`
    case 'heal_self':
      return `they recover ${then.value} health`
    case 'heal_pct':
      return `they recover ${pct(then.value)} of their maximum health`
    case 'hurt_self':
      return `it costs them ${then.value} health`
    case 'hurt_them':
      return `the opponent loses ${then.value} health`
    case 'steal_hp':
      return `they take ${then.value} health off the opponent`
    case 'revive':
      return `they get back up on ${pct(then.value)} health`
    case 'stun_them':
      return 'the opponent loses their next action'
    case 'skip_my_turn':
      return 'they lose the action'
    case 'guard':
      return 'they brace, halving the next hit'
    case 'charge_meter':
      return `their signature charges ${then.value} step${then.value === 1 ? '' : 's'}`
    case 'boost_atk':
      return `their attack changes by ${then.value > 0 ? '+' : ''}${then.value}, permanently`
    case 'boost_def':
      return `their defense changes by ${then.value > 0 ? '+' : ''}${then.value}, permanently`
    case 'boost_spd':
      return `their speed changes by ${then.value > 0 ? '+' : ''}${then.value}, permanently`
    case 'pressure_add':
      return `their ${track} meter moves ${then.value > 0 ? '+' : ''}${then.value}`
    case 'pressure_mult':
      return `their ${track} meter jumps to ${then.value}× what it was`
    case 'silence_them':
      return "the opponent's own rules stop working for the rest of the fight"
    case 'win_now':
      return 'they win, there and then'
  }
}

/** One sentence, for the fighter sheet. "At the bell, they take 0× damage." */
export function describeRule(rule: Rule): string {
  const limit =
    rule.times > 0 ? ` (${rule.times === 1 ? 'once only' : `up to ${rule.times} times`})` : ''
  const odds = rule.chance < 100 && rule.when.on !== 'coin_flip' ? `, ${pct(rule.chance)} of the time` : ''
  return `${whenText(rule.when)}${odds}, ${thenText(rule.then)}${limit}.`
}

// ---------------------------------------------------------------------------
// The interpreter.
// ---------------------------------------------------------------------------

/**
 * What the sim hands the rules to work on.
 *
 * Structural, not a class, so `SideState` in sim.ts satisfies it by having the
 * right fields — which keeps the dependency one-way (sim imports rules, never
 * the reverse) and means the sim owns its own state shape.
 */
export interface RuleActor {
  readonly name: string
  hp: number
  readonly maxHp: number
  meter: number
  guarded: boolean
  stunned: boolean
  actions: number
  selfHarm: number
  damageDealt: number
  pressure: Record<PressureTrack, number>
  /** Permanent stat deltas from `boost_*`. Added to the sheet, never stored. */
  bonus: { atk: number; def: number; spd: number }
  /** Set by an opponent's `silence_them`. A silenced fighter's rules never fire. */
  silenced: boolean
  rules: Rule[]
  /** Activation count per rule, indexed alike. Enforces `times`. */
  fired: number[]
}

/** Everything a hook can hand back to the beat that called it. */
export interface RuleOutcome {
  /** Lines to append to the log entry, already prefixed with the rule's name. */
  texts: string[]
  /** Product of every `damage_taken_mult` / `immune` that fired at 'incoming'. */
  takenMult: number
  /** Product of every `damage_dealt_mult` that fired at 'attack'. */
  dealtMult: number
  /** Sum of every `reflect` percentage that fired at 'incoming'. */
  reflect: number
  /** A `skip_my_turn` fired. */
  skip: boolean
  /** A `revive` fired — the owner is back up and the fight continues. */
  revived: boolean
  /** A `win_now` fired for the owner. */
  win: boolean
}

function emptyOutcome(): RuleOutcome {
  return { texts: [], takenMult: 1, dealtMult: 1, reflect: 0, skip: false, revived: false, win: false }
}

/**
 * Context a trigger may need beyond the two actors.
 *
 * `mine` is the load-bearing one. Several hooks fire twice — once for each
 * fighter — because both sides have rules that care about the same moment from
 * opposite ends ('fall' is watched by both `when_i_would_fall` and
 * `when_they_would_fall`). `mine` is how a rule knows which end it is on, and
 * every paired trigger below reads it. Without it, calling a hook for one side
 * would fire the other side's mirror trigger too.
 */
export interface RuleContext {
  /** True when the rule's owner is the subject of this moment. */
  mine: boolean
  /** The effect of the move being thrown this beat, if any. */
  effect?: MoveEffect
  /** True when the move being thrown is the signature. */
  signature?: boolean
  /** At the 'resolved' hook: did the action connect? */
  landed?: boolean
}

function matches(rule: Rule, me: RuleActor, foe: RuleActor, ctx: RuleContext): boolean {
  const when = rule.when
  switch (when.on) {
    case 'fight_start':
      return true
    case 'my_turn':
    case 'always':
      return ctx.mine
    case 'their_turn':
      return !ctx.mine
    case 'coin_flip':
      // The draw happens in `fire`; matching is just "it's my beat".
      return ctx.mine
    case 'first_turns':
      return ctx.mine && me.actions < when.value
    case 'after_turn':
      return ctx.mine && me.actions >= when.value
    case 'every_other_turn':
      // `actions` is the count *before* this one, so action N is index N-1.
      return ctx.mine && when.value > 0 && (me.actions + 1) % when.value === 0
    case 'my_hp_below':
      return ctx.mine && me.hp * 100 < me.maxHp * when.value
    case 'my_hp_above':
      return ctx.mine && me.hp * 100 > me.maxHp * when.value
    case 'their_hp_below':
      return ctx.mine && foe.hp * 100 < foe.maxHp * when.value
    case 'my_meter_full':
      return ctx.mine && me.meter >= 3
    case 'when_i_attack':
      return ctx.mine
    case 'when_i_use_signature':
      return ctx.mine && ctx.signature === true
    case 'when_i_am_hit':
      return true
    case 'when_they_use':
      return ctx.effect === when.effect
    case 'when_i_land':
      return ctx.landed === true
    case 'when_i_miss':
      return ctx.landed === false
    case 'when_i_would_fall':
      return ctx.mine
    case 'when_they_would_fall':
      return !ctx.mine
  }
}

/**
 * Apply one rule that has already matched. Mutates `me` and `foe` directly and
 * folds anything the caller has to consume into `out`.
 *
 * Every branch is a bounded arithmetic operation on state that already exists.
 * Nothing here allocates, loops, recurses, or evaluates another rule — which is
 * property (1) at the top of this file, enforced by construction rather than by
 * a comment.
 */
function apply(rule: Rule, me: RuleActor, foe: RuleActor, out: RuleOutcome): void {
  const then = rule.then
  const track = then.track ?? 'hex'

  switch (then.do) {
    case 'immune':
      out.takenMult = 0
      break
    case 'damage_taken_mult':
      out.takenMult *= then.value
      break
    case 'damage_dealt_mult':
      out.dealtMult *= then.value
      break
    case 'reflect':
      out.reflect += then.value
      break
    case 'heal_self':
      me.hp = Math.min(me.maxHp, me.hp + then.value)
      break
    case 'heal_pct':
      me.hp = Math.min(me.maxHp, me.hp + Math.round((me.maxHp * then.value) / 100))
      break
    case 'hurt_self':
      me.hp = Math.max(0, me.hp - then.value)
      me.selfHarm += then.value
      break
    case 'hurt_them':
      foe.hp = Math.max(0, foe.hp - then.value)
      me.damageDealt += then.value
      break
    case 'steal_hp': {
      const taken = Math.min(then.value, foe.hp)
      foe.hp -= taken
      me.hp = Math.min(me.maxHp, me.hp + taken)
      me.damageDealt += taken
      break
    }
    case 'revive':
      // Only meaningful at the 'fall' hook, and only if they're actually down.
      if (me.hp === 0) {
        me.hp = Math.max(1, Math.round((me.maxHp * then.value) / 100))
        out.revived = true
      }
      break
    case 'stun_them':
      foe.stunned = true
      break
    case 'skip_my_turn':
      out.skip = true
      break
    case 'guard':
      me.guarded = true
      break
    case 'charge_meter':
      me.meter += then.value
      break
    case 'boost_atk':
      me.bonus.atk += then.value
      break
    case 'boost_def':
      me.bonus.def += then.value
      break
    case 'boost_spd':
      me.bonus.spd += then.value
      break
    case 'pressure_add':
      me.pressure[track] = Math.max(0, me.pressure[track] + then.value)
      break
    case 'pressure_mult':
      me.pressure[track] = me.pressure[track] * then.value
      break
    case 'silence_them':
      foe.silenced = true
      break
    case 'win_now':
      out.win = true
      break
  }
}

/**
 * Run every rule the owner has for one hook.
 *
 * `rng` is the rules' own stream — see `RULES_SALT`. It is drawn from only when
 * a rule with a sub-100 chance actually matches, and it is a separate stream
 * from both the sim's and pressure's, so a fighter with rules cannot shift a
 * single roll in the physical fight and a fighter without rules cannot touch it
 * at all.
 */
export function fireRules(
  hook: RuleHook,
  me: RuleActor,
  foe: RuleActor,
  ctx: RuleContext,
  rng: () => number,
): RuleOutcome {
  const out = emptyOutcome()
  if (me.silenced || me.rules.length === 0) return out

  for (let i = 0; i < me.rules.length; i++) {
    const rule = me.rules[i]
    if (TRIGGER_HOOK[rule.when.on] !== hook) continue
    if (rule.times > 0 && me.fired[i] >= rule.times) continue
    if (!matches(rule, me, foe, ctx)) continue

    const odds = rule.when.on === 'coin_flip' ? rule.when.value : rule.chance
    if (odds < 100 && !rollChance(rng, odds / 100)) continue

    me.fired[i] += 1
    apply(rule, me, foe, out)
    out.texts.push(rule.text ? `${rule.name}: ${rule.text}` : `${rule.name}.`)
  }

  return out
}
