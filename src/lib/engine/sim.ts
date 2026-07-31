import { chance, makeRng, range } from './rng'
import { hesitateText, narrate, selfHarmText, stunnedText } from './narrate'
import { classifyVictory } from './victory'
import type { VictorySideView } from './victory'
import type { FighterCore, Move, SimResult, Side, TurnEvent } from './types'

const MAX_ACTIONS_PER_SIDE = 14
/** Actions banked before the signature move fires. */
const METER_TO_SPECIAL = 3
const DAMAGE_COEFFICIENT = 7
const OVERHEAT_COST = 8
const STAMINA_COST = 4
const STAMINA_AFTER_ACTION = 6

interface SideState {
  fighter: FighterCore
  hp: number
  maxHp: number
  meter: number
  guarded: boolean
  stunned: boolean
  actions: number
  damageDealt: number
  // Tallies below feed victory classification only — nothing in the resolution
  // loop reads them.
  damageTaken: number
  drainDealt: number
  selfHarm: number
  landed: number
  missed: number
}

export function maxHpFor(hpStat: number): number {
  return 40 + hpStat * 8
}

function initSide(fighter: FighterCore): SideState {
  const maxHp = maxHpFor(fighter.stats.hp)
  return {
    fighter,
    hp: maxHp,
    maxHp,
    meter: 0,
    guarded: false,
    stunned: false,
    actions: 0,
    damageDealt: 0,
    damageTaken: 0,
    drainDealt: 0,
    selfHarm: 0,
    landed: 0,
    missed: 0,
  }
}

function view(s: SideState): VictorySideView {
  return {
    hp: s.hp,
    maxHp: s.maxHp,
    damageDealt: s.damageDealt,
    damageTaken: s.damageTaken,
    drainDealt: s.drainDealt,
    selfHarm: s.selfHarm,
    landed: s.landed,
    missed: s.missed,
    actions: s.actions,
    atk: s.fighter.stats.atk,
    def: s.fighter.stats.def,
    flaw: s.fighter.flaw.effect,
  }
}

/** Faster fighter opens. Ties break on attack, then on the challenger. */
function firstMover(a: FighterCore, b: FighterCore): Side {
  if (a.stats.spd !== b.stats.spd) return a.stats.spd > b.stats.spd ? 'a' : 'b'
  if (a.stats.atk !== b.stats.atk) return a.stats.atk > b.stats.atk ? 'a' : 'b'
  return 'a'
}

function other(side: Side): Side {
  return side === 'a' ? 'b' : 'a'
}

function missChance(move: Move, flaw: FighterCore['flaw']): number {
  let p = 0
  if (move.effect === 'heavy') p += 0.25
  if (flaw.effect === 'wild') p += 0.2
  return p
}

export function simulate(a: FighterCore, b: FighterCore, seed: number): SimResult {
  const rng = makeRng(seed)
  const state: Record<Side, SideState> = { a: initSide(a), b: initSide(b) }
  const order: Side[] = firstMover(a, b) === 'a' ? ['a', 'b'] : ['b', 'a']
  const log: TurnEvent[] = []

  let turn = 0
  let winner: Side | null = null

  const snapshot = () => ({ a: state.a.hp, b: state.b.hp })

  const push = (
    actor: Side,
    move: string,
    effect: TurnEvent['effect'],
    damage: number,
    heal: number,
    missed: boolean,
    text: string,
  ) => {
    log.push({ turn: ++turn, actor, move, effect, damage, heal, missed, hp: snapshot(), text })
  }

  outer: for (let round = 0; round < MAX_ACTIONS_PER_SIDE; round++) {
    for (const side of order) {
      const me = state[side]
      const foe = state[other(side)]

      // --- Flaws that cost an action outright -----------------------------
      if (me.stunned) {
        me.stunned = false
        me.actions += 1
        push(side, '—', 'damage', 0, 0, false, stunnedText(me.fighter.name))
        continue
      }

      if (me.fighter.flaw.effect === 'slow_start' && me.actions === 0) {
        me.actions += 1
        push(side, '—', 'damage', 0, 0, false, hesitateText(me.fighter.name))
        continue
      }

      // --- Pick the move --------------------------------------------------
      const useSpecial = me.meter >= METER_TO_SPECIAL
      const move = useSpecial ? me.fighter.moves[1] : me.fighter.moves[0]
      if (useSpecial) me.meter = 0
      else me.meter += 1

      let selfHarm = 0
      let selfHarmReason: 'overheat' | 'stamina' | null = null

      if (useSpecial && me.fighter.flaw.effect === 'overheat') {
        selfHarm += OVERHEAT_COST
        selfHarmReason = 'overheat'
      }

      // --- Resolve --------------------------------------------------------
      const missed = chance(rng, missChance(move, me.fighter.flaw))
      if (missed) me.missed += 1
      let damage = 0
      let heal = 0

      if (!missed) {
        if (move.effect === 'heal') {
          heal = Math.min(move.power * 4, me.maxHp - me.hp)
          me.hp += heal
        } else if (move.effect === 'guard') {
          me.guarded = true
        } else {
          const mult =
            move.effect === 'heavy' ? 1.6 : move.effect === 'drain' ? 0.7 : move.effect === 'stun' ? 0.8 : 1
          let raw =
            move.power *
            (me.fighter.stats.atk / (foe.fighter.stats.def + 10)) *
            DAMAGE_COEFFICIENT *
            mult

          if (foe.fighter.flaw.effect === 'glass') raw *= 1.25
          if (foe.guarded) {
            raw *= 0.5
            foe.guarded = false
          }
          raw *= range(rng, 0.85, 1.15)

          damage = Math.max(1, Math.round(raw))
          foe.hp = Math.max(0, foe.hp - damage)
          me.damageDealt += damage
          me.landed += 1
          foe.damageTaken += damage

          if (move.effect === 'drain') {
            me.drainDealt += damage
            heal = Math.min(Math.round(damage * 0.5), me.maxHp - me.hp)
            me.hp += heal
          }
          if (move.effect === 'stun' && foe.hp > 0 && chance(rng, 0.35)) {
            foe.stunned = true
          }
        }
      }

      me.actions += 1

      if (me.fighter.flaw.effect === 'stamina' && me.actions > STAMINA_AFTER_ACTION) {
        selfHarm += STAMINA_COST
        if (!selfHarmReason) selfHarmReason = 'stamina'
      }
      if (selfHarm > 0) {
        me.hp = Math.max(0, me.hp - selfHarm)
        me.selfHarm += selfHarm
      }

      const lethal = foe.hp === 0
      let text = narrate({
        attacker: me.fighter.name,
        defender: foe.fighter.name,
        move: move.name,
        effect: move.effect,
        damage,
        heal,
        missed,
        lethal,
      })
      if (selfHarm > 0 && selfHarmReason) {
        text += ` ${selfHarmText(me.fighter.name, selfHarm, selfHarmReason)}`
      }

      push(side, move.name, move.effect, damage, heal, missed, text)

      // A fighter can finish itself off with overheat or stamina.
      if (me.hp === 0) {
        winner = other(side)
        break outer
      }
      if (foe.hp === 0) {
        winner = side
        break outer
      }
    }
  }

  let decision = false
  if (!winner) {
    decision = true
    const fracA = state.a.hp / state.a.maxHp
    const fracB = state.b.hp / state.b.maxHp
    if (fracA !== fracB) winner = fracA > fracB ? 'a' : 'b'
    else if (state.a.damageDealt !== state.b.damageDealt) {
      winner = state.a.damageDealt > state.b.damageDealt ? 'a' : 'b'
    } else winner = 'a'
  }

  const last = log[log.length - 1]
  const victory = classifyVictory({
    winner,
    decision,
    seed,
    finalBlow: last ? { actor: last.actor, effect: last.effect, damage: last.damage } : null,
    sides: { a: view(state.a), b: view(state.b) },
  })

  return {
    log,
    winner,
    maxHp: { a: state.a.maxHp, b: state.b.maxHp },
    decision,
    victory,
  }
}
