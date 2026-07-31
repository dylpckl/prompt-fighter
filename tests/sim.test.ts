import { describe, expect, it } from 'vitest'
import { maxHpFor, simulate } from '../supabase/functions/_shared/sim.ts'
import { makeRng } from '../supabase/functions/_shared/rng.ts'
import { FLAW_EFFECTS, MOVE_EFFECTS, STAT_TOTAL } from '../supabase/functions/_shared/types.ts'
import type { FighterCore, FlawEffect, MoveEffect } from '../supabase/functions/_shared/types.ts'

function fighter(overrides: Partial<FighterCore> = {}): FighterCore {
  return {
    name: 'Test',
    stats: { hp: 8, atk: 8, def: 7, spd: 7 },
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
  const values = [3, 3, 3, 3]
  for (let i = 0; i < STAT_TOTAL - 12; i++) {
    const candidates = values.map((v, idx) => ({ v, idx })).filter(({ v }) => v < 12)
    const pick = candidates[Math.floor(rng() * candidates.length)]
    values[pick.idx] += 1
  }
  const effect = (): MoveEffect => MOVE_EFFECTS[Math.floor(rng() * MOVE_EFFECTS.length)]
  const flaw = (): FlawEffect => FLAW_EFFECTS[Math.floor(rng() * FLAW_EFFECTS.length)]

  return {
    name,
    stats: { hp: values[0], atk: values[1], def: values[2], spd: values[3] },
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
    const b = fighter({ name: 'Beta', stats: { hp: 6, atk: 11, def: 4, spd: 9 } })

    const first = simulate(a, b, 12345)
    const second = simulate(a, b, 12345)

    expect(second).toEqual(first)
  })

  it('produces different fights for different seeds', () => {
    const a = fighter({ name: 'Alpha' })
    const b = fighter({ name: 'Beta', stats: { hp: 9, atk: 7, def: 8, spd: 6 } })

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
    for (let i = 0; i < 200; i++) {
      const result = simulate(randomFighter(rng, 'A'), randomFighter(rng, 'B'), i)
      const last = result.log[result.log.length - 1]
      const zeroed = last.hp.a === 0 || last.hp.b === 0

      // A KO must be the final event; otherwise the fight went to a decision.
      expect(zeroed).toBe(!result.decision)
      for (const event of result.log.slice(0, -1)) {
        expect(event.hp.a === 0 || event.hp.b === 0).toBe(false)
      }
    }
  })

  it('gives the faster fighter the opening action', () => {
    const quick = fighter({ name: 'Quick', stats: { hp: 7, atk: 8, def: 6, spd: 9 } })
    const slow = fighter({ name: 'Slow', stats: { hp: 9, atk: 8, def: 8, spd: 5 } })

    expect(simulate(quick, slow, 42).log[0].actor).toBe('a')
    expect(simulate(slow, quick, 42).log[0].actor).toBe('b')
  })

  it('costs a fighter with slow_start its first action', () => {
    const sluggish = fighter({
      name: 'Sluggish',
      stats: { hp: 8, atk: 8, def: 6, spd: 8 },
      flaw: { name: 'Cold engine', effect: 'slow_start' },
    })
    const other = fighter({ name: 'Other', stats: { hp: 8, atk: 7, def: 7, spd: 8 } })

    const result = simulate(sluggish, other, 5)
    const opening = result.log[0]

    expect(opening.actor).toBe('a')
    expect(opening.damage).toBe(0)
    expect(opening.text).toContain('slow off the mark')
  })

  it('fires the signature move once the meter fills', () => {
    const a = fighter({ name: 'Alpha', stats: { hp: 12, atk: 3, def: 12, spd: 3 } })
    const b = fighter({
      name: 'Beta',
      stats: { hp: 12, atk: 3, def: 12, spd: 4 },
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

describe('maxHpFor', () => {
  it('scales the hp stat into a usable health pool', () => {
    expect(maxHpFor(3)).toBe(64)
    expect(maxHpFor(12)).toBe(136)
  })
})
