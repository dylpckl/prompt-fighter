import { describe, expect, it } from 'vitest'
import { simulate } from '../src/lib/engine/sim'
import { makeRng } from '../src/lib/engine/rng'
import {
  PRESSURE_POOLS,
  PRESSURE_TRACKS,
  VICTORY_LABELS,
  VICTORY_TYPES,
  WEDDING_CHA,
  classifyPressure,
  classifyVictory,
  victoryText,
} from '../src/lib/engine/victory'
import type { VictoryInput, VictorySideView, VictoryType } from '../src/lib/engine/victory'
import {
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  SPIRIT_MAX,
  SPIRIT_MIN,
  SPIRIT_TOTAL,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from '../src/lib/engine/types'
import type { FighterCore, FlawEffect, MoveEffect, SpiritStats } from '../src/lib/engine/types'

function side(overrides: Partial<VictorySideView> = {}): VictorySideView {
  return {
    hp: 60,
    maxHp: 100,
    damageDealt: 80,
    damageTaken: 40,
    drainDealt: 0,
    selfHarm: 0,
    landed: 6,
    missed: 0,
    actions: 6,
    atk: 8,
    def: 7,
    flaw: 'glass',
    spirit: { cha: 5, wil: 5, arc: 5, luk: 5 },
    ...overrides,
  }
}

/** A seed that survives both flavour draws, so the mechanical branch is reached. */
const PLAIN_SEED = 1

function input(overrides: Partial<VictoryInput> = {}): VictoryInput {
  return {
    winner: 'a',
    decision: false,
    seed: PLAIN_SEED,
    finalBlow: { actor: 'a', effect: 'damage', damage: 12 },
    sides: { a: side(), b: side({ hp: 0 }) },
    pressure: null,
    ...overrides,
  }
}

describe('classifyVictory', () => {
  it('falls back to a knockout for an ordinary finish', () => {
    expect(classifyVictory(input())).toBe('ko')
  })

  it('falls back to a decision for an ordinary full-distance fight', () => {
    expect(classifyVictory(input({ decision: true, sides: { a: side(), b: side({ hp: 30 }) } }))).toBe(
      'decision',
    )
  })

  it('calls a double KO when both sides are emptied', () => {
    expect(classifyVictory(input({ sides: { a: side({ hp: 0 }), b: side({ hp: 0 }) } }))).toBe(
      'double_ko',
    )
  })

  it('calls self-destruct when the loser threw the final action', () => {
    expect(classifyVictory(input({ finalBlow: { actor: 'b', effect: 'damage', damage: 0 } }))).toBe(
      'self_destruct',
    )
  })

  it('calls a no-show when a slow starter never landed anything', () => {
    const result = classifyVictory(
      input({ sides: { a: side(), b: side({ hp: 0, landed: 0, flaw: 'slow_start' }) } }),
    )
    expect(result).toBe('no_show')
  })

  it('disqualifies a wild fighter who kept missing', () => {
    const result = classifyVictory(
      input({ sides: { a: side(), b: side({ hp: 0, missed: 4, flaw: 'wild' }) } }),
    )
    expect(result).toBe('disqualification')
  })

  it('calls a ring-out on a heavy finisher against soft defence', () => {
    const result = classifyVictory(
      input({
        finalBlow: { actor: 'a', effect: 'heavy', damage: 12 },
        sides: { a: side({ atk: 12 }), b: side({ hp: 0, def: 3 }) },
      }),
    )
    expect(result).toBe('ring_out')
  })

  it('calls overkill when the last hit was disproportionate', () => {
    const result = classifyVictory(input({ finalBlow: { actor: 'a', effect: 'damage', damage: 55 } }))
    expect(result).toBe('overkill')
  })

  it('calls absorption when most of the damage was drained', () => {
    const result = classifyVictory(
      input({ sides: { a: side({ damageDealt: 100, drainDealt: 90 }), b: side({ hp: 0 }) } }),
    )
    expect(result).toBe('absorption')
  })

  it('calls it perfect only when the winner was untouched', () => {
    const untouched = { a: side({ damageTaken: 0 }), b: side({ hp: 0 }) }
    expect(classifyVictory(input({ sides: untouched }))).toBe('perfect')
  })

  it('does not count self-harm against a perfect win', () => {
    const sides = { a: side({ damageTaken: 0, selfHarm: 16 }), b: side({ hp: 0 }) }
    expect(classifyVictory(input({ sides }))).toBe('perfect')
  })

  it('calls attrition when the winner finishes nearly empty', () => {
    const result = classifyVictory(
      input({ decision: true, sides: { a: side({ hp: 4 }), b: side({ hp: 2 }) } }),
    )
    expect(result).toBe('attrition')
  })

  it('retires a loser who bled out on stamina', () => {
    const result = classifyVictory(
      input({
        decision: true,
        sides: { a: side(), b: side({ hp: 20, flaw: 'stamina', selfHarm: 12 }) },
      }),
    )
    expect(result).toBe('retirement')
  })

  it('calls hunger on a listless full-distance loser', () => {
    const result = classifyVictory(
      input({
        decision: true,
        sides: { a: side(), b: side({ hp: 30, actions: 10, landed: 2, damageDealt: 8 }) },
      }),
    )
    expect(result).toBe('hunger')
  })

  it('does not call hunger on a loser who kept landing hits', () => {
    const result = classifyVictory(
      input({
        decision: true,
        sides: { a: side(), b: side({ hp: 30, actions: 10, landed: 9, damageDealt: 8 }) },
      }),
    )
    expect(result).toBe('decision')
  })

  it('reads a capped meter over every mechanical finish underneath it', () => {
    // A textbook knockout on paper — but a meter capped, so that's the story.
    const result = classifyVictory(input({ pressure: 'hex' }))
    expect(PRESSURE_POOLS.hex).toContain(result)
  })

  it('takes the track from the sim rather than guessing at one', () => {
    for (const track of PRESSURE_TRACKS) {
      expect(PRESSURE_POOLS[track]).toContain(classifyVictory(input({ pressure: track })))
    }
  })
})

describe('classifyPressure', () => {
  const plain: SpiritStats = { cha: 5, wil: 5, arc: 5, luk: 5 }

  it('is stable for a given track, seed and pair of profiles', () => {
    for (const seed of [1, 77, 4096, 90210]) {
      expect(classifyPressure('crowd', seed, plain, plain)).toBe(
        classifyPressure('crowd', seed, plain, plain),
      )
    }
  })

  it('always answers from the track that capped', () => {
    for (const track of PRESSURE_TRACKS) {
      for (let seed = 0; seed < 60; seed++) {
        expect(PRESSURE_POOLS[track]).toContain(classifyPressure(track, seed, plain, plain))
      }
    }
  })

  it('reads two capped charmers as a wedding, whatever the roll says', () => {
    const smitten: SpiritStats = { cha: WEDDING_CHA, wil: 4, arc: 4, luk: 4 }
    for (let seed = 0; seed < 60; seed++) {
      expect(classifyPressure('crowd', seed, smitten, smitten)).toBe('wedding')
    }
    // One-sided charm is just a win.
    expect(classifyPressure('crowd', 3, smitten, { ...smitten, cha: 2 })).not.toBe('wedding')
  })

  it('separates two fighters who cap the same track on the same seed', () => {
    const loud: SpiritStats = { cha: 10, wil: 4, arc: 3, luk: 3 }
    const lucky: SpiritStats = { cha: 4, wil: 3, arc: 3, luk: 10 }
    const outcomes = new Set([
      classifyPressure('crowd', 9, loud, lucky),
      classifyPressure('crowd', 9, lucky, loud),
    ])
    expect(outcomes.size).toBe(2)
  })

  it('leaves no pooled type dead', () => {
    const seen = new Set<VictoryType>()
    const profiles: SpiritStats[] = [
      { cha: 10, wil: 2, arc: 4, luk: 4 },
      { cha: 2, wil: 10, arc: 4, luk: 4 },
      { cha: 4, wil: 4, arc: 10, luk: 2 },
      { cha: 5, wil: 5, arc: 5, luk: 5 },
    ]

    for (const track of PRESSURE_TRACKS) {
      for (let seed = 0; seed < 80; seed++) {
        for (const winner of profiles) {
          for (const loser of profiles) seen.add(classifyPressure(track, seed, winner, loser))
        }
      }
    }

    for (const track of PRESSURE_TRACKS) {
      for (const type of PRESSURE_POOLS[track]) expect(seen).toContain(type)
    }
  })
})

describe('classification safety properties', () => {
  /** Spend a budget one point at a time, respecting the per-stat ceiling. */
  function spread(rng: () => number, min: number, max: number, total: number): number[] {
    const values = [min, min, min, min]
    for (let i = 0; i < total - min * 4; i++) {
      const candidates = values.map((v, idx) => ({ v, idx })).filter(({ v }) => v < max)
      const pick = candidates[Math.floor(rng() * candidates.length)]
      values[pick.idx] += 1
    }
    return values
  }

  function randomFighter(rng: () => number, name: string): FighterCore {
    const values = spread(rng, STAT_MIN, STAT_MAX, STAT_TOTAL)
    const spirit = spread(rng, SPIRIT_MIN, SPIRIT_MAX, SPIRIT_TOTAL)
    const effect = (): MoveEffect => MOVE_EFFECTS[Math.floor(rng() * MOVE_EFFECTS.length)]
    const flaw = (): FlawEffect => FLAW_EFFECTS[Math.floor(rng() * FLAW_EFFECTS.length)]

    return {
      name,
      stats: {
        hp: values[0],
        atk: values[1],
        def: values[2],
        spd: values[3],
        cha: spirit[0],
        wil: spirit[1],
        arc: spirit[2],
        luk: spirit[3],
      },
      moves: [
        { name: 'Basic', power: 3 + Math.floor(rng() * 4), effect: effect() },
        { name: 'Special', power: 6 + Math.floor(rng() * 5), effect: effect() },
      ],
      flaw: { name: 'Flaw', effect: flaw() },
    }
  }

  it('always lands on a known type, with text, over a wide fuzz', () => {
    const rng = makeRng(2024)
    for (let i = 0; i < 500; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)

      expect(VICTORY_TYPES).toContain(result.victory)
      expect(VICTORY_LABELS[result.victory]).toBeTruthy()
      expect(victoryText(result.victory, 'A', 'B').length).toBeGreaterThan(0)
    }
  })

  it('is stable for a given seed', () => {
    const rng = makeRng(5)
    const a = randomFighter(rng, 'A')
    const b = randomFighter(rng, 'B')

    for (const seed of [1, 77, 4096, 90210]) {
      expect(simulate(a, b, seed).victory).toBe(simulate(a, b, seed).victory)
    }
  })

  it('never contradicts the decision flag', () => {
    const rng = makeRng(31337)
    const koOnly = new Set(['ko', 'overkill', 'ring_out', 'perfect', 'absorption', 'self_destruct', 'double_ko', 'no_show', 'disqualification'])
    const decisionOnly = new Set(['decision', 'attrition', 'retirement', 'hunger'])

    for (let i = 0; i < 500; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)

      // A capped meter answers to its own track and to neither flag.
      if (result.pressure) {
        expect(result.decision).toBe(false)
        expect(PRESSURE_POOLS[result.pressure]).toContain(result.victory)
        continue
      }

      // act_of_god and paperwork are deliberately outcome-agnostic.
      if (result.victory === 'act_of_god' || result.victory === 'paperwork') continue

      if (result.decision) expect(decisionOnly).toContain(result.victory)
      else expect(koOnly).toContain(result.victory)
    }
  })

  it('never reports a pressure type for a fight decided on health', () => {
    const pooled = new Set<VictoryType>(PRESSURE_TRACKS.flatMap((t) => [...PRESSURE_POOLS[t]]))
    const rng = makeRng(6060)

    for (let i = 0; i < 500; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)
      if (result.pressure) continue
      expect(pooled.has(result.victory)).toBe(false)
    }
  })

  it('sorts every declared type into exactly one pool, or none at all', () => {
    const counts = new Map<string, number>()
    for (const track of PRESSURE_TRACKS) {
      for (const type of PRESSURE_POOLS[track]) {
        expect(VICTORY_TYPES).toContain(type)
        counts.set(type, (counts.get(type) ?? 0) + 1)
      }
    }
    for (const [, n] of counts) expect(n).toBe(1)
    // 15 physical reads, the rest pooled.
    expect(VICTORY_TYPES.length - counts.size).toBe(15)
  })

  /**
   * The tuning guard. Pressure is meant to be a *peer* of the knockout — one of
   * the ways a fight ends, at roughly the rate the health bars end one — and the
   * band is wide on both sides because both edges are real failures.
   *
   * Too low and the mechanic is decorative: the meters creep to a quarter of the
   * bar and stop, which is precisely where the constants sat before the retune,
   * and three quarters of the spirit budget stops meaning anything. Too high and
   * the physical fight is the decoration instead — the health bars become a
   * countdown nobody reads, and every bout is decided by a stat the player never
   * connects to the punching.
   */
  it('keeps a capped meter about as likely as a knockout', () => {
    const rng = makeRng(4242)
    const seen = new Set<VictoryType>()
    let pressureWins = 0
    const fights = 3000

    for (let i = 0; i < fights; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)
      seen.add(result.victory)
      if (result.pressure) pressureWins += 1
    }

    const share = pressureWins / fights
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.45)
    // Every track has to be live at this sample size.
    for (const track of PRESSURE_TRACKS) {
      expect(PRESSURE_POOLS[track].some((type) => seen.has(type))).toBe(true)
    }
  })

  /**
   * The guard above draws its spirit lines by scattering the budget, which is
   * *not* the shape SYSTEM_PROMPT asks for — it tells the model to avoid flat
   * spreads and to commit when the description commits. The committed shape gets
   * its own guard because it is the one that has to pay off: two fighters who
   * both went all-in on a track *should* usually settle it on a meter, and the
   * ceiling here is only to keep "usually" from becoming "always".
   */
  it('lets two committed specialists usually settle it on a meter', () => {
    const rng = makeRng(1717)
    let pressureWins = 0
    const fights = 3000

    /** One track at the ceiling, whatever is left scattered over the other three. */
    function committed(name: string): FighterCore {
      const fighter = randomFighter(rng, name)
      const values = [SPIRIT_MIN, SPIRIT_MIN, SPIRIT_MIN, SPIRIT_MIN]
      const primary = Math.floor(rng() * 4)
      values[primary] = SPIRIT_MAX

      let left = SPIRIT_TOTAL - SPIRIT_MAX - SPIRIT_MIN * 3
      while (left > 0) {
        const candidates = values
          .map((v, idx) => ({ v, idx }))
          .filter(({ v, idx }) => idx !== primary && v < SPIRIT_MAX)
        if (candidates.length === 0) break
        values[candidates[Math.floor(rng() * candidates.length)].idx] += 1
        left -= 1
      }

      const [cha, wil, arc, luk] = values
      return { ...fighter, stats: { ...fighter.stats, cha, wil, arc, luk } }
    }

    for (let i = 0; i < fights; i++) {
      if (simulate(committed('A'), committed('B'), i).pressure) pressureWins += 1
    }

    const share = pressureWins / fights
    // The payoff for commitment — and still not a certainty.
    expect(share).toBeGreaterThan(0.35)
    expect(share).toBeLessThan(0.75)
  })

  /**
   * What "as likely as a knockout" is actually supposed to mean: a *rate that
   * tracks the stat line*, not a coin flip bolted onto every fight.
   *
   * This is the guard the previous tuning was missing, and the one that would
   * have caught what was wrong with it. Both share guards above can be satisfied
   * by a mechanic that is effectively a threshold — under the old constants the
   * fight-long mood draw was bunched so tightly that a given pair of spirit lines
   * had a near-deterministic verdict, so Presence 8 capped a meter 15% of the
   * time and Presence 6 capped 3%, and everything below all-in was playing a
   * different game. The aggregate rate looked defensible the whole time.
   *
   * So: assert the shape, not the average. More Presence must mean more crowd
   * wins at every step, the floor must stay inert, and the middle of the range
   * has to be genuinely live rather than rounding to nothing.
   */
  it('pays out on the crowd track in proportion to Presence', () => {
    /** `cha` as asked, the rest of the budget spread flat behind it. */
    function presence(cha: number): SpiritStats {
      const rest = [SPIRIT_MIN, SPIRIT_MIN, SPIRIT_MIN]
      let left = SPIRIT_TOTAL - cha - SPIRIT_MIN * 3
      for (let i = 0; left > 0; i = (i + 1) % 3) {
        if (rest[i] >= SPIRIT_MAX) continue
        rest[i] += 1
        left -= 1
      }
      return { cha, wil: rest[0], arc: rest[1], luk: rest[2] }
    }

    /** How often `cha` points of Presence talk a random opponent out of the ring. */
    function rate(cha: number): number {
      const rng = makeRng(31337)
      const fights = 1200
      let won = 0
      for (let i = 0; i < fights; i++) {
        const base = randomFighter(rng, 'A')
        const a = { ...base, stats: { ...base.stats, ...presence(cha) } }
        const b = randomFighter(rng, 'B')
        const result = simulate(a, b, i)
        if (result.pressure === 'crowd' && result.winner === 'a') won += 1
      }
      return won / fights
    }

    const floor = rate(SPIRIT_MIN)
    const middling = rate(6)
    const committed = rate(8)
    const allIn = rate(SPIRIT_MAX)

    // Nothing above the floor is spent, so nothing is ever pushed. Exactly zero,
    // not "rarely" — `pressurePush` makes this arithmetic, not statistical.
    expect(floor).toBe(0)

    // Every point buys something, all the way up.
    expect(middling).toBeGreaterThan(floor)
    expect(committed).toBeGreaterThan(middling)
    expect(allIn).toBeGreaterThan(committed)

    // And the middle of the range is a real option rather than a rounding error.
    // This is the number that was 2.8% before the retune.
    expect(middling).toBeGreaterThan(0.05)
    expect(committed).toBeGreaterThan(0.2)
  })

  it('gives every declared type a label and a line', () => {
    for (const type of VICTORY_TYPES) {
      expect(VICTORY_LABELS[type]).toBeTruthy()
      const text = victoryText(type, 'Winner', 'Loser')
      expect(text.length).toBeGreaterThan(0)
    }
  })
})
