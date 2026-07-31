import { describe, expect, it } from 'vitest'
import { simulate } from '../src/lib/engine/sim'
import { makeRng } from '../src/lib/engine/rng'
import {
  VICTORY_LABELS,
  VICTORY_TYPES,
  classifyVictory,
  victoryText,
} from '../src/lib/engine/victory'
import type { VictoryInput, VictorySideView } from '../src/lib/engine/victory'
import { FLAW_EFFECTS, MOVE_EFFECTS, STAT_TOTAL } from '../src/lib/engine/types'
import type { FighterCore, FlawEffect, MoveEffect } from '../src/lib/engine/types'

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
})

describe('classification safety properties', () => {
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
      // act_of_god and paperwork are deliberately outcome-agnostic.
      if (result.victory === 'act_of_god' || result.victory === 'paperwork') continue

      if (result.decision) expect(decisionOnly).toContain(result.victory)
      else expect(koOnly).toContain(result.victory)
    }
  })

  it('gives every declared type a label and a line', () => {
    for (const type of VICTORY_TYPES) {
      expect(VICTORY_LABELS[type]).toBeTruthy()
      const text = victoryText(type, 'Winner', 'Loser')
      expect(text.length).toBeGreaterThan(0)
    }
  })
})
