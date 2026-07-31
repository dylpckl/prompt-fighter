// How a fight was won, as opposed to who won it.
//
// Everything here is a *label* derived from a finished fight. Classification
// runs after the sim loop, reads only the final state, and never touches
// `winner` or `decision` — so adding a victory type can't change the outcome of
// a fight, and every seed that existed before still resolves identically.
//
// The flavour draws below come from their own RNG stream, seeded off the fight
// seed but separate from it, for the same reason: consuming from the sim's
// stream would shift every subsequent roll and silently rewrite history.

import { makeRng } from './rng'
import type { FlawEffect, Side } from './types'

export const VICTORY_TYPES = [
  // Decisive
  'ko',
  'overkill',
  'ring_out',
  'perfect',
  'absorption',
  'self_destruct',
  'double_ko',
  // The opponent never really showed up
  'no_show',
  'disqualification',
  // The fight went the distance
  'decision',
  'attrition',
  'retirement',
  'hunger',
  // Nobody's fault
  'act_of_god',
  'paperwork',
] as const

export type VictoryType = (typeof VICTORY_TYPES)[number]

/** Short banner text. Kept to two words so it fits the result panel. */
export const VICTORY_LABELS: Record<VictoryType, string> = {
  ko: 'Knockout',
  overkill: 'Overkill',
  ring_out: 'Ring-out',
  perfect: 'Perfect',
  absorption: 'Absorption',
  self_destruct: 'Self-destruct',
  double_ko: 'Double KO',
  no_show: 'No-show',
  disqualification: 'Disqualification',
  decision: 'Decision',
  attrition: 'Attrition',
  retirement: 'Retirement',
  hunger: 'Hunger',
  act_of_god: 'Act of God',
  paperwork: 'Paperwork',
}

/** The slice of a fighter's fight-long tally that classification cares about. */
export interface VictorySideView {
  hp: number
  maxHp: number
  /** Damage dealt to the opponent. Excludes self-harm. */
  damageDealt: number
  /** Damage taken *from the opponent*. Excludes self-harm, so `perfect` means untouched. */
  damageTaken: number
  /** Of `damageDealt`, how much came from drain moves. */
  drainDealt: number
  /** Health lost to overheat and stamina. */
  selfHarm: number
  landed: number
  missed: number
  actions: number
  atk: number
  def: number
  flaw: FlawEffect
}

export interface VictoryInput {
  winner: Side
  decision: boolean
  seed: number
  /** Effect and damage of the fight's final action, for the finisher checks. */
  finalBlow: { actor: Side; effect: string; damage: number } | null
  sides: Record<Side, VictorySideView>
}

const OVERKILL_FRACTION = 0.4
const ABSORPTION_FRACTION = 0.6
const ATTRITION_FRACTION = 0.15
const RING_OUT_GAP = 4
const WILD_MISSES_FOR_DQ = 3
const ACT_OF_GOD_CHANCE = 0.03
const PAPERWORK_CHANCE = 0.08
/**
 * "Wasn't trying" has to be a genuinely rare read, or it eats every decision
 * that happened to be low-scoring. Both bars must be cleared: almost nothing
 * landed, and what did land barely registered.
 */
const LISTLESS_DAMAGE_PER_ACTION = 2
const LISTLESS_MIN_ACTIONS = 6
const LISTLESS_MAX_LANDED = 4

/**
 * First match wins, so the order is specificity-descending: the weird readings
 * get first refusal, and `ko` / `decision` are the fallbacks that always match.
 */
export function classifyVictory(input: VictoryInput): VictoryType {
  const { winner, decision, sides, finalBlow } = input
  const w = sides[winner]
  const l = sides[winner === 'a' ? 'b' : 'a']

  // Own stream, drawn unconditionally so the draw count never depends on a
  // branch. Two numbers, always, whatever the fight did.
  const flavour = makeRng(input.seed ^ 0x5f375a86)
  const chaosRoll = flavour()
  const paperworkRoll = flavour()

  if (chaosRoll < ACT_OF_GOD_CHANCE) return 'act_of_god'

  if (!decision) {
    if (w.hp === 0 && l.hp === 0) return 'double_ko'

    // The sim lets a fighter finish itself with overheat or stamina. When the
    // loser's own action was the last thing to happen, that's what occurred.
    if (l.hp === 0 && finalBlow?.actor !== winner) return 'self_destruct'

    if (l.flaw === 'slow_start' && l.landed === 0) return 'no_show'
    if (l.flaw === 'wild' && l.missed >= WILD_MISSES_FOR_DQ) return 'disqualification'

    if (
      finalBlow?.effect === 'heavy' &&
      w.atk - l.def >= RING_OUT_GAP
    ) {
      return 'ring_out'
    }
    if (finalBlow && finalBlow.damage >= l.maxHp * OVERKILL_FRACTION) return 'overkill'

    if (w.damageDealt > 0 && w.drainDealt >= w.damageDealt * ABSORPTION_FRACTION) {
      return 'absorption'
    }
    if (w.damageTaken === 0) return 'perfect'

    return 'ko'
  }

  if (paperworkRoll < PAPERWORK_CHANCE) return 'paperwork'

  if (w.hp <= w.maxHp * ATTRITION_FRACTION) return 'attrition'
  if (l.flaw === 'stamina' && l.selfHarm > 0) return 'retirement'
  if (
    l.actions >= LISTLESS_MIN_ACTIONS &&
    l.landed <= LISTLESS_MAX_LANDED &&
    l.damageDealt < l.actions * LISTLESS_DAMAGE_PER_ACTION
  ) {
    return 'hunger'
  }

  return 'decision'
}

/**
 * One line for the result panel. Same contract as narrate.ts — the model
 * already did the naming, so stitching those names into a sentence is enough.
 */
export function victoryText(type: VictoryType, winner: string, loser: string): string {
  switch (type) {
    case 'ko':
      return `${loser} does not get back up. ${winner} takes it.`
    case 'overkill':
      return `That was more than enough. Somebody check on ${loser}.`
    case 'ring_out':
      return `${winner} launches ${loser} clean off the stage. Row four caught them.`
    case 'perfect':
      return `${loser} never laid a hand on ${winner}. Not once.`
    case 'absorption':
      return `There's noticeably less of ${loser} than there was. ${winner} looks well.`
    case 'self_destruct':
      return `${winner} barely had to move — ${loser} came apart entirely on their own.`
    case 'double_ko':
      return `Both of them go down together. The count gives it to ${winner}.`
    case 'no_show':
      return `${loser} never really turned up. ${winner} wins against a rumour.`
    case 'disqualification':
      return `${loser} hit the referee, the timekeeper, and a support column. Disqualified.`
    case 'decision':
      return `Full distance, no knockdown. The cards go to ${winner}.`
    case 'attrition':
      return `${winner} is standing, technically, and that's the whole requirement.`
    case 'retirement':
      return `${loser} retires mid-bout, citing the knees. ${winner} respects it.`
    case 'hunger':
      return `${loser} ordered food in round three and lost interest. ${winner} advances.`
    case 'act_of_god':
      return `The lighting rig comes down between them. Officials award it to ${winner}.`
    case 'paperwork':
      return `${loser}'s fighting licence lapsed nine days ago. ${winner} wins on the filing.`
  }
}
