import { describe, expect, it } from 'vitest'
import { simulate } from '../src/lib/engine/sim'
import { makeRng } from '../src/lib/engine/rng'
import {
  FAVORITE_CEILING,
  FAVORITE_HALF,
  crowdSupport,
  crowdSupportPercent,
} from '../src/lib/engine/favorites'
import { hydrateFighter } from '../src/lib/engine/validate'
import { PRESSURE_TRACKS } from '../src/lib/engine/victory'
import { SPIRIT_MAX, SPIRIT_MIN } from '../src/lib/engine/types'
import type { FighterCore, SpiritStats } from '../src/lib/engine/types'

/**
 * Two immovable objects with nothing to hit each other with — the same shape
 * sim.test.ts uses, so any fight between these goes the distance unless
 * something non-physical happens. It is the only way to read the pressure
 * mechanic without a knockout cutting the bout short first.
 */
function stalemate(spirit: SpiritStats, name: string, favorites?: number): FighterCore {
  return {
    name,
    stats: { hp: 12, atk: 3, def: 12, spd: 3, ...spirit },
    moves: [
      { name: 'Tap', power: 3, effect: 'damage' },
      { name: 'Firmer tap', power: 3, effect: 'damage' },
    ],
    flaw: { name: 'Steady', effect: 'glass' },
    ...(favorites === undefined ? {} : { favorites }),
  }
}

/** Everything into Presence. The build favorites are supposed to amplify. */
const TALKER: SpiritStats = { cha: SPIRIT_MAX, wil: SPIRIT_MIN, arc: 4, luk: 4 }

/** Presence on the floor. `pressurePush` returns zero here, whatever the crowd. */
const MUTE: SpiritStats = { cha: SPIRIT_MIN, wil: SPIRIT_MIN, arc: SPIRIT_MAX, luk: 4 }

/** A middling opponent who pushes nothing and resists a little. */
const FOIL: SpiritStats = { cha: SPIRIT_MIN, wil: 6, arc: SPIRIT_MIN, luk: SPIRIT_MIN }

const SEEDS = 400

/** How often `a` talks `b` out of the ring on the crowd track. */
function crowdWinRate(a: FighterCore, b: FighterCore): number {
  let capped = 0
  for (let seed = 0; seed < SEEDS; seed++) {
    const result = simulate(a, b, seed)
    if (result.pressure === 'crowd' && result.winner === 'a') capped += 1
  }
  return capped / SEEDS
}

describe('crowdSupport', () => {
  it('is exactly 1 for a fighter nobody has favorited', () => {
    // Not "about 1" — every fight recorded before favorites existed has to
    // resolve identically, and that only holds if this is a true no-op.
    expect(crowdSupport(0)).toBe(1)
  })

  it('reads a missing or nonsense count as no support', () => {
    for (const input of [undefined, null, NaN, Infinity, -5, -0.5]) {
      expect(crowdSupport(input as number)).toBe(1)
    }
  })

  it('climbs with favorites and never reaches the ceiling', () => {
    let previous = crowdSupport(0)
    for (let n = 1; n <= 1000; n++) {
      const value = crowdSupport(n)
      expect(value).toBeGreaterThan(previous)
      expect(value).toBeLessThan(FAVORITE_CEILING)
      previous = value
    }
  })

  it('puts half the boost at FAVORITE_HALF', () => {
    expect(crowdSupport(FAVORITE_HALF)).toBeCloseTo(1 + (FAVORITE_CEILING - 1) / 2, 10)
  })

  it('pays out fastest at the start', () => {
    // Diminishing returns, stated as an inequality rather than as numbers so the
    // tuning dial can move without rewriting the test: the first favorite has to
    // be worth more than the tenth, which is worth more than the hundredth.
    const step = (n: number) => crowdSupport(n + 1) - crowdSupport(n)
    expect(step(0)).toBeGreaterThan(step(10))
    expect(step(10)).toBeGreaterThan(step(100))
  })

  it('reports a whole percentage for the UI', () => {
    expect(crowdSupportPercent(0)).toBe(0)
    expect(crowdSupportPercent(FAVORITE_HALF)).toBe(25)
    expect(crowdSupportPercent(undefined)).toBe(0)
  })
})

describe('favorites in the sim', () => {
  /**
   * The compatibility guarantee. An unfavorited fighter multiplies its crowd
   * meter by exactly 1, so a fixture that never mentions favorites and one that
   * says zero must produce the same fight down to the last beat — including the
   * meters, which are floats before they are rounded for display.
   */
  it('changes nothing at all for a fighter with no favorites', () => {
    const silent = stalemate(TALKER, 'Talker')
    const explicit = stalemate(TALKER, 'Talker', 0)
    const foil = stalemate(FOIL, 'Foil')

    for (let seed = 0; seed < 200; seed++) {
      expect(simulate(explicit, foil, seed)).toEqual(simulate(silent, foil, seed))
    }
  })

  /**
   * The load-bearing anti-pay-to-win property. Support multiplies the *push*,
   * and `pressurePush` is zero for a fighter on the Presence floor — so this is
   * arithmetic, not tuning. A following cannot give a quiet fighter a voice.
   */
  it('is worth nothing to a fighter who never bought Presence', () => {
    const quiet = stalemate(MUTE, 'Quiet')
    const adored = stalemate(MUTE, 'Quiet', 500)
    const foil = stalemate(FOIL, 'Foil')

    for (let seed = 0; seed < 200; seed++) {
      const plain = simulate(quiet, foil, seed)
      const backed = simulate(adored, foil, seed)

      expect(backed).toEqual(plain)
      for (const event of backed.log) expect(event.pressure.a.crowd).toBe(0)
    }
  })

  it('lifts the crowd meter and leaves hex and fate alone', () => {
    // Enough Weirdness and Fate to be visibly accruing on both, so "unchanged"
    // is a real claim about live meters rather than about two rows of zeros.
    const spread: SpiritStats = { cha: 8, wil: SPIRIT_MIN, arc: 5, luk: 5 }
    const plain = simulate(stalemate(spread, 'Star'), stalemate(FOIL, 'Foil'), 7)
    const backed = simulate(stalemate(spread, 'Star', 40), stalemate(FOIL, 'Foil'), 7)

    // Compare on the shortest common prefix: a hotter crowd meter can end the
    // bout sooner, which is the point.
    const beats = Math.min(plain.log.length, backed.log.length)
    let sawCrowd = false
    let sawOthers = false

    for (let i = 0; i < beats; i++) {
      const before = plain.log[i].pressure.a
      const after = backed.log[i].pressure.a

      expect(after.crowd).toBeGreaterThanOrEqual(before.crowd)
      if (after.crowd > before.crowd) sawCrowd = true

      for (const track of PRESSURE_TRACKS) {
        if (track === 'crowd') continue
        expect(after[track]).toBe(before[track])
        if (after[track] > 0) sawOthers = true
      }
    }

    expect(sawCrowd).toBe(true)
    expect(sawOthers).toBe(true)
  })

  it('makes a backed talker win on the crowd more often', () => {
    const foil = () => stalemate(FOIL, 'Foil')
    const alone = crowdWinRate(stalemate(TALKER, 'Talker'), foil())
    const backed = crowdWinRate(stalemate(TALKER, 'Talker', 40), foil())

    // The mechanic has to actually do something, and the fixture has to leave
    // room for it to — a track already capping every time proves nothing.
    expect(alone).toBeGreaterThan(0)
    expect(alone).toBeLessThan(1)
    expect(backed).toBeGreaterThan(alone)
  })

  it('never lets favorites alone decide the fight', () => {
    // A wall of Resolve against a maximally-backed talker: the boost must still
    // be resistible. Same guarantee `wilResistance` carries in the other
    // direction — no legal build is immune, and no amount of support is a win.
    const adored = stalemate(TALKER, 'Adored', 10_000)
    const stubborn = stalemate(
      { cha: SPIRIT_MIN, wil: SPIRIT_MAX, arc: 4, luk: 4 },
      'Stubborn',
    )

    let capped = 0
    for (let seed = 0; seed < SEEDS; seed++) {
      if (simulate(adored, stubborn, seed).pressure === 'crowd') capped += 1
    }
    expect(capped).toBeGreaterThan(0)
    expect(capped).toBeLessThan(SEEDS)
  })

  it('stays deterministic and terminating with favorites in play', () => {
    const rng = makeRng(4242)
    for (let i = 0; i < 200; i++) {
      const favorites = Math.floor(rng() * 200)
      const a = stalemate(TALKER, 'A', favorites)
      const b = stalemate(FOIL, 'B', Math.floor(rng() * 200))
      const seed = Math.floor(rng() * 2 ** 31)

      const first = simulate(a, b, seed)
      expect(simulate(a, b, seed)).toEqual(first)
      expect(['a', 'b']).toContain(first.winner)
      expect(first.log.length).toBeGreaterThan(0)
    }
  })
})

describe('hydrateFighter', () => {
  const row = {
    id: 'f1',
    name: 'Test',
    title: 'The Tested',
    stats: { hp: 8, atk: 8, def: 7, spd: 7, cha: 5, wil: 5, arc: 5, luk: 5 },
    moves: [],
    flaw: { name: 'Brittle', effect: 'glass' },
    sprite: { palette: [], rows: [] },
    wins: 1,
    losses: 2,
  }

  it('fills in a count for rows written before the column existed', () => {
    expect(hydrateFighter(row).favorites).toBe(0)
  })

  it('passes a real count through', () => {
    expect(hydrateFighter({ ...row, favorites: 7 }).favorites).toBe(7)
  })

  it('refuses to hand the sim anything that could poison a meter', () => {
    for (const junk of [null, undefined, -3, 'lots', NaN, {}]) {
      const favorites = hydrateFighter({ ...row, favorites: junk }).favorites
      expect(Number.isInteger(favorites)).toBe(true)
      expect(favorites).toBeGreaterThanOrEqual(0)
    }
  })
})
