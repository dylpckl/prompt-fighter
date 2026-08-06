import { chance, makeRng, range } from './rng'
import { crowdSupport } from './favorites'
import { hesitateText, narrate, pressureText, selfHarmText, stunnedText } from './narrate'
import {
  PRESSURE_JITTER_MAX,
  PRESSURE_JITTER_MIN,
  PRESSURE_SALT,
  PRESSURE_THRESHOLD,
  PRESSURE_TRACKS,
  TRACK_RATE,
  TRACK_SOURCE,
  classifyVictory,
  pressureMood,
  pressurePush,
  wilResistance,
} from './victory'
import type { PressureTrack, VictorySideView } from './victory'
import { RULES_SALT, fireRules } from './rules'
import type { RuleActor } from './rules'
import { METER_TO_SPECIAL, SPIRIT_DEFAULT } from './types'
import type { FighterCore, Move, SimResult, Side, SpiritKey, TurnEvent } from './types'

const MAX_ACTIONS_PER_SIDE = 14
const DAMAGE_COEFFICIENT = 7
const OVERHEAT_COST = 8
const STAMINA_COST = 4
const STAMINA_AFTER_ACTION = 6

type Meters = Record<PressureTrack, number>

/**
 * `SideState` structurally satisfies `RuleActor`, which is what lets
 * `lib/engine/rules.ts` mutate a side without importing this file. The `extends`
 * is the compiler holding us to it: drop `bonus`, rename `silenced`, or change
 * `pressure`'s shape and this stops building rather than silently handing the
 * interpreter an object it can't work on.
 */
interface SideState extends RuleActor {
  fighter: FighterCore
  hp: number
  maxHp: number
  /**
   * Crowd-meter multiplier from this fighter's favorites, resolved once at the
   * top of the fight. Exactly 1 for a fighter nobody has favorited.
   */
  support: number
  meter: number
  guarded: boolean
  stunned: boolean
  actions: number
  damageDealt: number
  /** The non-physical half of the fight. Capping one of these ends it outright. */
  pressure: Meters
  /** Permanent stat deltas from `boost_*` rules. Zeroes for a fighter with none. */
  bonus: { atk: number; def: number; spd: number }
  /** Set by an opponent's `silence_them`. Silenced rules never fire again. */
  silenced: boolean
  /** How many times each rule has fired, indexed alongside `rules`. */
  fired: number[]
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
  const rules = fighter.rules ?? []
  return {
    fighter,
    name: fighter.name,
    hp: maxHp,
    maxHp,
    // Read once, before the first beat. A favorite landing mid-bout must not
    // change a fight already in progress — and in bracket mode the whole fight
    // is simulated up front and replayed from the stored log, so "mid-bout"
    // there is a viewer's clock, not the sim's.
    support: crowdSupport(fighter.favorites),
    meter: 0,
    guarded: false,
    stunned: false,
    actions: 0,
    damageDealt: 0,
    pressure: { crowd: 0, hex: 0, fate: 0 },
    bonus: { atk: 0, def: 0, spd: 0 },
    silenced: false,
    rules,
    // One counter per rule, so `times` is enforced per rule rather than per
    // fighter. Allocated to match; `fireRules` indexes the two together.
    fired: rules.map(() => 0),
    damageTaken: 0,
    drainDealt: 0,
    selfHarm: 0,
    landed: 0,
    missed: 0,
  }
}

/**
 * Attack and defense as the sim actually reads them: the sheet plus whatever
 * `boost_*` rules have done to it.
 *
 * Both floors matter. Attack can't go below 1 or a fighter debuffed hard enough
 * would deal nothing forever and turn a bout into fourteen rounds of zeroes.
 * Defense can't go below 0 because it sits in the `+ 10` divisor — a negative
 * one large enough would cross zero and flip the sign of every hit that fighter
 * takes, healing them. Clamping is what keeps the damage formula total for any
 * stat line rules can produce.
 */
function atkOf(s: SideState): number {
  return Math.max(1, s.fighter.stats.atk + s.bonus.atk)
}

function defOf(s: SideState): number {
  return Math.max(0, s.fighter.stats.def + s.bonus.def)
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
    atk: atkOf(s),
    def: defOf(s),
    flaw: s.fighter.flaw.effect,
    spirit: {
      cha: spiritOf(s, 'cha'),
      wil: spiritOf(s, 'wil'),
      arc: spiritOf(s, 'arc'),
      luk: spiritOf(s, 'luk'),
    },
  }
}

/**
 * Fighter rows written before the spirit budget existed have no spirit keys, and
 * an undefined here would poison a meter with NaN all the way to the client.
 * Migration 0003 backfills them; this is the belt to that pair of braces.
 */
function spiritOf(s: SideState, key: SpiritKey): number {
  return s.fighter.stats[key] ?? SPIRIT_DEFAULT
}

/**
 * Meters are carried as floats and reported as whole points out of the cap.
 * Floored and clamped, not rounded, so a reported meter reads full exactly when
 * the fight actually stopped — no 100/100 on a bout that carried on.
 */
function readMeters(s: SideState): Meters {
  const read = (v: number) => Math.min(PRESSURE_THRESHOLD, Math.floor(v))
  return {
    crowd: read(s.pressure.crowd),
    hex: read(s.pressure.hex),
    fate: read(s.pressure.fate),
  }
}

/**
 * One beat of pressure for the acting side. Their cha/arc/luk lean on three
 * tracks at once and the opponent's wil slows all three down at once, so a
 * fighter with nothing to say never gets going and a stubborn one is very hard
 * — but never impossible — to talk out of the ring.
 *
 * `support` is the one asymmetry: favorites are people in the room, so they
 * multiply the crowd track and leave hex and fate alone. It multiplies `push`,
 * which is zero for a fighter on the Presence floor — so a following can make a
 * talker louder and can never give a quiet fighter a voice.
 *
 * The jitter is drawn from a stream of its own, unconditionally and in a fixed
 * order, so no branch here can move the sim's rng by a single call.
 */
function accruePressure(
  me: SideState,
  foe: SideState,
  jitter: () => number,
  mood: number,
): PressureTrack | null {
  let capped: PressureTrack | null = null
  const resistance = wilResistance(spiritOf(foe, 'wil'))

  for (const track of PRESSURE_TRACKS) {
    const push = pressurePush(spiritOf(me, TRACK_SOURCE[track]))
    const support = track === 'crowd' ? me.support : 1
    const wobble = range(jitter, PRESSURE_JITTER_MIN, PRESSURE_JITTER_MAX)
    me.pressure[track] += push * TRACK_RATE[track] * resistance * wobble * mood * support
    if (!capped && me.pressure[track] >= PRESSURE_THRESHOLD) capped = track
  }

  return capped
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
  // Pressure gets its own stream. Drawing its jitter from `rng` would shift
  // every roll after it and silently rewrite every fight already on record.
  const pressureRng = makeRng((seed ^ PRESSURE_SALT) >>> 0)
  // And rules get a third, for the same reason one step further on: a fighter
  // that carries rules must not move a single physical roll for the fighter
  // that doesn't. This stream is only ever drawn from by `fireRules`, and only
  // when a matched rule has sub-100 odds — so two fighters with no rules
  // between them produce a bit-identical fight to the one they produced before
  // this file knew what a rule was.
  const rulesRng = makeRng((seed ^ RULES_SALT) >>> 0)
  // One draw, before the loop and before anything can branch: how receptive the
  // room is tonight. Shared by both sides so it tilts the bout, not a fighter.
  const mood = pressureMood(pressureRng())
  const state: Record<Side, SideState> = { a: initSide(a), b: initSide(b) }
  const order: Side[] = firstMover(a, b) === 'a' ? ['a', 'b'] : ['b', 'a']
  const log: TurnEvent[] = []

  let turn = 0
  let winner: Side | null = null
  let pressure: PressureTrack | null = null

  const snapshot = () => ({ a: state.a.hp, b: state.b.hp })
  const meterSnapshot = () => ({ a: state.a.meter, b: state.b.meter })

  /** Meters are display values, so they're squared off on the way out, never in place. */
  const meters = (): Record<Side, Meters> => ({
    a: readMeters(state.a),
    b: readMeters(state.b),
  })

  const push = (
    actor: Side,
    move: string,
    effect: TurnEvent['effect'],
    damage: number,
    heal: number,
    missed: boolean,
    text: string,
    rules: string[] = [],
  ) => {
    log.push({
      turn: ++turn,
      actor,
      move,
      effect,
      damage,
      heal,
      missed,
      hp: snapshot(),
      pressure: meters(),
      meter: meterSnapshot(),
      text,
      rules,
    })
  }

  /**
   * Someone's HP reached zero. Both sides get the 'fall' hook — the faller may
   * have a way back up, and the other side may have been waiting for exactly
   * this moment — and the answer is whether the fall stands.
   *
   * A revive here cannot make a fight immortal: it puts HP back, and HP is not
   * what bounds the loop. `MAX_ACTIONS_PER_SIDE` is, and nothing a rule can do
   * reaches it. A fighter who revives on every knockdown simply survives to the
   * final bell and wins or loses on the decision like anyone else.
   */
  const fall = (down: Side, lines: string[]): boolean => {
    const faller = state[down]
    const standing = state[other(down)]
    lines.push(...fireRules('fall', faller, standing, { mine: true }, rulesRng).texts)
    lines.push(...fireRules('fall', standing, faller, { mine: false }, rulesRng).texts)
    return faller.hp === 0
  }

  // --- The bell -----------------------------------------------------------
  // `fight_start` rules land before anyone has acted, so they get a beat of
  // their own rather than being folded into the first punch. Side 'a' first,
  // always, so the order doesn't depend on who happens to be faster.
  {
    const opening: string[] = []
    for (const side of ['a', 'b'] as const) {
      const out = fireRules('start', state[side], state[other(side)], { mine: true }, rulesRng)
      opening.push(...out.texts)
      if (out.win) state[other(side)].hp = 0
    }
    if (opening.length > 0) {
      push('a', '—', 'damage', 0, 0, false, 'Before the bell.', opening)
    }
    // A fighter who opened by winning, or by killing itself, never gets a turn.
    if (state.a.hp === 0 || state.b.hp === 0) {
      const down: Side = state.a.hp === 0 ? 'a' : 'b'
      const lines: string[] = []
      const stayedDown = fall(down, lines)
      if (stayedDown) winner = other(down)
      if (lines.length > 0) {
        push(other(down), '—', 'damage', 0, 0, false, `${state[down].fighter.name} is down.`, lines)
      }
    }
  }

  outer: for (let round = 0; round < MAX_ACTIONS_PER_SIDE && !winner; round++) {
    for (const side of order) {
      const me = state[side]
      const foe = state[other(side)]

      // A beat is one side's action, and you work the room on your own time.
      // Accrued up front so the meters shown on this beat include it, and so
      // every branch below draws the same number of jitter values.
      const capped = accruePressure(me, foe, pressureRng, mood)

      // --- The meter tips over before the punch is thrown ------------------
      if (capped) {
        winner = side
        pressure = capped
        const text = pressureText(capped, me.fighter.name, foe.fighter.name)
        push(side, '—', 'damage', 0, 0, false, text)
        break outer
      }

      // --- Rules that fire at the top of an action ------------------------
      // Twice: the acting side's own turn triggers, then the other side's
      // `their_turn`. Order is fixed (actor first) so the draws from the rules
      // stream are, too.
      const lines: string[] = []
      const mineTurn = fireRules('turn', me, foe, { mine: true }, rulesRng)
      lines.push(...mineTurn.texts)
      const theirTurn = fireRules('turn', foe, me, { mine: false }, rulesRng)
      lines.push(...theirTurn.texts)

      if (mineTurn.win) foe.hp = 0
      if (theirTurn.win) me.hp = 0

      // A rule may have finished someone before a punch was thrown — a drain, a
      // self-inflicted cost, or an outright `win_now`.
      if (me.hp === 0 || foe.hp === 0) {
        const down: Side = me.hp === 0 ? side : other(side)
        if (fall(down, lines)) {
          winner = other(down)
          push(side, '—', 'damage', 0, 0, false, `${state[down].fighter.name} is down.`, lines)
          break outer
        }
      }

      if (mineTurn.skip) {
        me.actions += 1
        push(side, '—', 'damage', 0, 0, false, `${me.fighter.name} doesn't move.`, lines)
        continue
      }

      // --- Flaws that cost an action outright -----------------------------
      if (me.stunned) {
        me.stunned = false
        me.actions += 1
        push(side, '—', 'damage', 0, 0, false, stunnedText(me.fighter.name), lines)
        continue
      }

      if (me.fighter.flaw.effect === 'slow_start' && me.actions === 0) {
        me.actions += 1
        push(side, '—', 'damage', 0, 0, false, hesitateText(me.fighter.name), lines)
        continue
      }

      // --- Pick the move --------------------------------------------------
      const useSpecial = me.meter >= METER_TO_SPECIAL
      const move = useSpecial ? me.fighter.moves[1] : me.fighter.moves[0]
      if (useSpecial) me.meter = 0
      else me.meter += 1

      // --- Rules that read the move being thrown --------------------------
      const attackOut = fireRules(
        'attack',
        me,
        foe,
        { mine: true, signature: useSpecial, effect: move.effect },
        rulesRng,
      )
      lines.push(...attackOut.texts)

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
            move.power * (atkOf(me) / (defOf(foe) + 10)) * DAMAGE_COEFFICIENT * mult

          if (foe.fighter.flaw.effect === 'glass') raw *= 1.25
          if (foe.guarded) {
            raw *= 0.5
            foe.guarded = false
          }
          raw *= range(rng, 0.85, 1.15)
          raw *= attackOut.dealtMult

          // The defender's rules see the hit on its way in. This is the hook
          // that "nothing can hurt me" lives at: `immune` zeroes `takenMult`,
          // and everything downstream of here reads zero damage.
          const incoming = fireRules(
            'incoming',
            foe,
            me,
            { mine: false, effect: move.effect },
            rulesRng,
          )
          lines.push(...incoming.texts)
          raw *= incoming.takenMult

          // The `max(1, …)` floor stops a badly out-statted attacker rounding
          // away to nothing. A hit the defender actually nullified is a
          // different thing and has to read as zero, or invulnerability would
          // quietly still chip a point per swing.
          damage = incoming.takenMult === 0 ? 0 : Math.max(1, Math.round(raw))
          foe.hp = Math.max(0, foe.hp - damage)
          me.damageDealt += damage
          me.landed += 1
          foe.damageTaken += damage

          if (incoming.reflect > 0 && damage > 0) {
            const back = Math.min(me.hp, Math.max(1, Math.round((damage * incoming.reflect) / 100)))
            me.hp -= back
            foe.damageDealt += back
            me.damageTaken += back
          }

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

      // --- Rules that read how the action went ----------------------------
      const resolved = fireRules(
        'resolved',
        me,
        foe,
        { mine: true, effect: move.effect, signature: useSpecial, landed: !missed },
        rulesRng,
      )
      lines.push(...resolved.texts)
      if (resolved.win) foe.hp = 0

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

      // Falls resolve before the beat is written, so a fighter who gets back up
      // is already back up in the HP the log reports — the bar never dips to
      // zero and then jumps, it just never reaches zero.
      //
      // The attacker is checked first: they can finish themselves off with
      // overheat, stamina, or a rule, and dying on your own action loses you the
      // fight even if the same action would have won it.
      let downed: Side | null = me.hp === 0 ? side : foe.hp === 0 ? other(side) : null
      if (downed && !fall(downed, lines)) downed = null

      push(side, move.name, move.effect, damage, heal, missed, text, lines)

      if (downed) {
        winner = other(downed)
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
    pressure,
  })

  return {
    log,
    winner,
    maxHp: { a: state.a.maxHp, b: state.b.maxHp },
    decision,
    pressure,
    victory,
  }
}
