import { describe, expect, it } from 'vitest'
import { maxHpFor, simulate } from '../src/lib/engine/sim'
import { makeRng } from '../src/lib/engine/rng'
import {
  PRESSURE_POOLS,
  PRESSURE_THRESHOLD,
  PRESSURE_TRACKS,
} from '../src/lib/engine/victory'
import {
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  SPIRIT_DEFAULT,
  SPIRIT_MAX,
  SPIRIT_MIN,
  SPIRIT_TOTAL,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from '../src/lib/engine/types'
import type {
  FighterCore,
  FlawEffect,
  MoveEffect,
  SpiritStats,
  Stats,
} from '../src/lib/engine/types'

/** A spirit line that can never push a meter: the floor against the ceiling. */
const INERT: SpiritStats = {
  cha: SPIRIT_MIN,
  wil: SPIRIT_MAX,
  arc: SPIRIT_MIN,
  luk: SPIRIT_MIN,
}

const FLAT: SpiritStats = {
  cha: SPIRIT_DEFAULT,
  wil: SPIRIT_DEFAULT,
  arc: SPIRIT_DEFAULT,
  luk: SPIRIT_DEFAULT,
}

/**
 * Body four spelled out, spirit flat unless a test cares. A flat spirit line
 * accrues nothing against another flat one, so the physical fixtures below stay
 * purely physical.
 */
function stats(
  hp: number,
  atk: number,
  def: number,
  spd: number,
  spirit: SpiritStats = FLAT,
): Stats {
  return { hp, atk, def, spd, ...spirit }
}

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

function fighter(overrides: Partial<FighterCore> = {}): FighterCore {
  return {
    name: 'Test',
    stats: stats(8, 8, 7, 7),
    moves: [
      { name: 'Jab', power: 4, effect: 'damage' },
      { name: 'Haymaker', power: 8, effect: 'heavy' },
    ],
    flaw: { name: 'Brittle', effect: 'glass' },
    ...overrides,
  }
}

/** Random-but-legal fighters, so the fuzz exercises the same space the model produces. */
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

describe('simulate', () => {
  it('is deterministic for a given seed', () => {
    const a = fighter({ name: 'Alpha' })
    const b = fighter({ name: 'Beta', stats: stats(6, 11, 4, 9) })

    const first = simulate(a, b, 12345)
    const second = simulate(a, b, 12345)

    expect(second).toEqual(first)
  })

  it('produces different fights for different seeds', () => {
    const a = fighter({ name: 'Alpha' })
    const b = fighter({ name: 'Beta', stats: stats(9, 7, 8, 6) })

    const logs = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(simulate(a, b, s).log)))
    expect(logs.size).toBeGreaterThan(1)
  })

  it('always terminates with a winner and non-negative HP', () => {
    const rng = makeRng(99)
    for (let i = 0; i < 400; i++) {
      const a = randomFighter(rng, 'A')
      const b = randomFighter(rng, 'B')
      const result = simulate(a, b, Math.floor(rng() * 2 ** 31))

      expect(['a', 'b']).toContain(result.winner)
      expect(result.log.length).toBeGreaterThan(0)
      expect(result.log.length).toBeLessThanOrEqual(28)

      for (const event of result.log) {
        expect(event.hp.a).toBeGreaterThanOrEqual(0)
        expect(event.hp.b).toBeGreaterThanOrEqual(0)
        expect(event.hp.a).toBeLessThanOrEqual(result.maxHp.a)
        expect(event.hp.b).toBeLessThanOrEqual(result.maxHp.b)
        expect(event.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('ends the moment a fighter is knocked out', () => {
    const rng = makeRng(7)
    const seen = { ko: 0, decision: 0, pressure: 0 }

    for (let i = 0; i < 200; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)
      const last = result.log[result.log.length - 1]
      const zeroed = last.hp.a === 0 || last.hp.b === 0

      // Three ways out, and they're mutually exclusive: HP hit zero, a meter
      // capped, or it went the distance. Nothing is both.
      expect(result.decision && result.pressure !== null).toBe(false)
      const knockout = !result.decision && !result.pressure

      // A KO must be the final event; otherwise the fight went to a decision or
      // stopped on a capped meter, and in neither case is anyone on the floor.
      expect(zeroed).toBe(knockout)
      for (const event of result.log.slice(0, -1)) {
        expect(event.hp.a === 0 || event.hp.b === 0).toBe(false)
      }

      seen[knockout ? 'ko' : result.pressure ? 'pressure' : 'decision'] += 1
    }

    // The invariant is only worth anything if the fuzz reaches all three.
    expect(seen.ko).toBeGreaterThan(0)
    expect(seen.decision).toBeGreaterThan(0)
    expect(seen.pressure).toBeGreaterThan(0)
  })

  it('gives the faster fighter the opening action', () => {
    const quick = fighter({ name: 'Quick', stats: stats(7, 8, 6, 9) })
    const slow = fighter({ name: 'Slow', stats: stats(9, 8, 8, 5) })

    expect(simulate(quick, slow, 42).log[0].actor).toBe('a')
    expect(simulate(slow, quick, 42).log[0].actor).toBe('b')
  })

  it('costs a fighter with slow_start its first action', () => {
    const sluggish = fighter({
      name: 'Sluggish',
      stats: stats(8, 8, 6, 8),
      flaw: { name: 'Cold engine', effect: 'slow_start' },
    })
    const other = fighter({ name: 'Other', stats: stats(8, 7, 7, 8) })

    const result = simulate(sluggish, other, 5)
    const opening = result.log[0]

    expect(opening.actor).toBe('a')
    expect(opening.damage).toBe(0)
    expect(opening.text).toContain('slow off the mark')
  })

  it('fires the signature move once the meter fills', () => {
    const a = fighter({ name: 'Alpha', stats: stats(12, 3, 12, 3) })
    const b = fighter({
      name: 'Beta',
      stats: stats(12, 3, 12, 4),
      moves: [
        { name: 'Poke', power: 3, effect: 'damage' },
        { name: 'Crescendo', power: 6, effect: 'damage' },
      ],
      flaw: { name: 'Thin skin', effect: 'glass' },
    })

    const result = simulate(a, b, 3)
    const bMoves = result.log.filter((e) => e.actor === 'b').map((e) => e.move)

    expect(bMoves.slice(0, 3)).toEqual(['Poke', 'Poke', 'Poke'])
    expect(bMoves[3]).toBe('Crescendo')
  })
})

/**
 * Two immovable objects with nothing to hit each other with. Any fight between
 * these goes the distance unless something non-physical happens.
 */
function stalemate(spirit: SpiritStats, name: string): FighterCore {
  return {
    name,
    stats: stats(12, 3, 12, 3, spirit),
    moves: [
      { name: 'Tap', power: 3, effect: 'damage' },
      { name: 'Firmer tap', power: 3, effect: 'damage' },
    ],
    flaw: { name: 'Steady', effect: 'glass' },
  }
}

/** Everything into Presence, nothing into Resolve. The worst case to defend. */
const MAXIMAL_PUSHER: SpiritStats = { cha: SPIRIT_MAX, wil: SPIRIT_MIN, arc: 4, luk: 4 }

/** A legal spirit line with `wil` as asked and the rest of the budget spread flat. */
function resolveLine(wil: number): SpiritStats {
  const rest = [SPIRIT_MIN, SPIRIT_MIN, SPIRIT_MIN]
  let left = SPIRIT_TOTAL - wil - SPIRIT_MIN * 3
  for (let i = 0; left > 0; i = (i + 1) % 3) {
    if (rest[i] >= SPIRIT_MAX) continue
    rest[i] += 1
    left -= 1
  }
  return { cha: rest[0], wil, arc: rest[1], luk: rest[2] }
}

describe('pressure', () => {
  it('lets a talker win a fight they were never going to win physically', () => {
    const talker = stalemate({ cha: 10, wil: 6, arc: 2, luk: 2 }, 'Talker')
    const quiet = stalemate({ cha: 2, wil: 2, arc: 8, luk: 8 }, 'Quiet')

    const result = simulate(talker, quiet, 11)
    const last = result.log[result.log.length - 1]

    expect(result.pressure).toBe('crowd')
    expect(result.winner).toBe('a')
    expect(result.decision).toBe(false)
    expect(PRESSURE_POOLS.crowd).toContain(result.victory)

    // Nobody was knocked out, and the capping beat settles nothing physical.
    expect(last.hp.a).toBeGreaterThan(0)
    expect(last.hp.b).toBeGreaterThan(0)
    expect(last.damage).toBe(0)
    expect(last.heal).toBe(0)
    expect(last.pressure.a.crowd).toBeGreaterThanOrEqual(PRESSURE_THRESHOLD)
    expect(last.text).toContain('Talker')
  })

  it('gives each track its own way to end a fight', () => {
    const seen = new Set<string | null>()
    const rng = makeRng(808)
    for (let i = 0; i < 600; i++) {
      seen.add(simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i).pressure)
    }
    for (const track of PRESSURE_TRACKS) expect(seen).toContain(track)
    expect(seen).toContain(null)
  })

  it('accrues nothing at all when the floor meets a wall of will', () => {
    const rng = makeRng(64)
    for (let i = 0; i < 120; i++) {
      const a = randomFighter(rng, 'A')
      const b = randomFighter(rng, 'B')
      a.stats = { ...a.stats, ...INERT }
      b.stats = { ...b.stats, ...INERT }

      const result = simulate(a, b, i)
      expect(result.pressure).toBeNull()
      for (const event of result.log) {
        for (const track of PRESSURE_TRACKS) {
          expect(event.pressure.a[track]).toBe(0)
          expect(event.pressure.b[track]).toBe(0)
        }
      }
    }
  })

  /**
   * The anti-hard-counter guarantee. Resolve used to be subtracted from the
   * pusher's stat, which meant a fight's fixed beat count turned any deficit
   * below a certain size into *absolute* immunity — a legal spirit line could
   * switch the whole mechanic off for the bout. Resistance is a fraction now, so
   * Resolve buys a lot of time and never buys a wall.
   */
  it('leaves no legal Resolve immune to a maximal pusher', () => {
    for (let wil = SPIRIT_MIN; wil <= SPIRIT_MAX; wil++) {
      const pusher = stalemate(MAXIMAL_PUSHER, 'Pusher')
      const stubborn = stalemate(resolveLine(wil), 'Stubborn')

      let capped = 0
      for (let seed = 0; seed < 400; seed++) {
        const result = simulate(pusher, stubborn, seed)
        if (result.pressure && result.winner === 'a') capped += 1
      }
      expect(capped, `wil ${wil} never gets talked out of the ring`).toBeGreaterThan(0)
    }
  })

  it('makes Resolve worth buying, with diminishing returns rather than a cliff', () => {
    const rate = (wil: number) => {
      const pusher = stalemate(MAXIMAL_PUSHER, 'Pusher')
      const stubborn = stalemate(resolveLine(wil), 'Stubborn')
      let capped = 0
      for (let seed = 0; seed < 400; seed++) {
        const result = simulate(pusher, stubborn, seed)
        if (result.pressure && result.winner === 'a') capped += 1
      }
      return capped / 400
    }

    const rates = Array.from({ length: SPIRIT_MAX - SPIRIT_MIN + 1 }, (_, i) => rate(SPIRIT_MIN + i))

    // Every extra point of Resolve helps, and the floor is far worse off than
    // the ceiling — but the curve is a slope the whole way down, never a step
    // from "some chance" to "none".
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1])
    }
    expect(rates[0]).toBeGreaterThan(rates[rates.length - 1] * 2)
  })

  /**
   * The RNG-stream guarantee, in-repo: pressure jitter is drawn from its own
   * stream, so a spirit line that never caps a meter cannot move a single roll
   * of the physical fight. The meters themselves are allowed to differ — they
   * are a readout — but nothing else may.
   */
  it('cannot touch the physical fight unless it caps a meter', () => {
    /** Everything except the meters, which are display state and nothing else. */
    const physical = (result: ReturnType<typeof simulate>) => ({
      ...result,
      log: result.log.map(({ pressure: _pressure, ...beat }) => beat),
    })

    const rng = makeRng(2718)
    for (let i = 0; i < 120; i++) {
      const a = randomFighter(rng, 'A')
      const b = randomFighter(rng, 'B')

      const inertA = { ...a, stats: { ...a.stats, ...INERT } }
      const inertB = { ...b, stats: { ...b.stats, ...INERT } }
      // Different numbers, same verdict: neither of these caps anything either.
      const otherA = { ...a, stats: { ...a.stats, cha: 3, wil: SPIRIT_MAX, arc: 4, luk: 3 } }
      const otherB = { ...b, stats: { ...b.stats, cha: 4, wil: SPIRIT_MAX, arc: 2, luk: 4 } }

      const quiet = simulate(inertA, inertB, i)
      const other = simulate(otherA, otherB, i)

      expect(quiet.pressure).toBeNull()
      expect(other.pressure).toBeNull()
      expect(physical(other)).toEqual(physical(quiet))
    }
  })

  it('only ever lets a meter climb, and stops the fight at the cap', () => {
    const rng = makeRng(1234)
    for (let i = 0; i < 200; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)
      const previous: Record<string, number> = {}

      result.log.forEach((event, index) => {
        for (const side of ['a', 'b'] as const) {
          for (const track of PRESSURE_TRACKS) {
            const value = event.pressure[side][track]
            const key = `${side}.${track}`
            expect(value).toBeGreaterThanOrEqual(previous[key] ?? 0)
            previous[key] = value

            // Only the final beat of a pressure win is allowed to be at the cap.
            const capped = value >= PRESSURE_THRESHOLD
            if (capped) expect(index).toBe(result.log.length - 1)
          }
        }
      })
    }
  })
})

describe('maxHpFor', () => {
  it('scales the hp stat into a usable health pool', () => {
    expect(maxHpFor(3)).toBe(64)
    expect(maxHpFor(12)).toBe(136)
  })
})
