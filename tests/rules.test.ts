import { describe, expect, it } from 'vitest'

import { simulate } from '../src/lib/engine/sim'
import { makeRng } from '../src/lib/engine/rng'
import {
  MAX_RULES,
  RULE_ACTIONS,
  RULE_TRIGGERS,
  TRIGGER_HOOK,
  describeRule,
  normalizeRules,
} from '../src/lib/engine/rules'
import type { Rule, RuleAction, RuleTrigger } from '../src/lib/engine/rules'
import { SPIRIT_DEFAULT } from '../src/lib/engine/types'
import type { FighterCore, Stats } from '../src/lib/engine/types'
import { PRESSURE_TRACKS } from '../src/lib/engine/victory'

const FLAT: Stats = {
  hp: 8,
  atk: 8,
  def: 7,
  spd: 7,
  cha: SPIRIT_DEFAULT,
  wil: SPIRIT_DEFAULT,
  arc: SPIRIT_DEFAULT,
  luk: SPIRIT_DEFAULT,
}

function rule(partial: Partial<Rule> & { when: Rule['when']; then: Rule['then'] }): Rule {
  return {
    name: 'Test Rule',
    text: 'It happens.',
    chance: 100,
    times: 0,
    ...partial,
  }
}

function fighter(name: string, rules: Rule[] = [], stats: Stats = FLAT): FighterCore {
  return {
    name,
    stats,
    moves: [
      { name: 'Jab', power: 5, effect: 'damage' },
      { name: 'Haymaker', power: 9, effect: 'heavy' },
    ],
    flaw: { name: 'Brittle', effect: 'glass' },
    rules,
  }
}

/**
 * The absolute ceiling on log entries: `MAX_ACTIONS_PER_SIDE` (14) beats a side,
 * plus the opening beat that `fight_start` rules get to themselves, plus the one
 * a fight decided at the bell can push. Any fight that exceeds this has found a
 * way to extend the loop, which is the one thing rules must never be able to do.
 */
const MAX_LOG = 14 * 2 + 2

describe('normalizeRules', () => {
  it('returns an empty list for anything that is not an array', () => {
    for (const junk of [undefined, null, 0, 'rules', {}, NaN]) {
      expect(normalizeRules(junk)).toEqual([])
    }
  })

  it('drops rules with an unrecognised trigger or action rather than correcting them', () => {
    const out = normalizeRules([
      { when: { on: 'when_the_moon_is_full', value: 0 }, then: { do: 'immune', value: 0 } },
      { when: { on: 'fight_start', value: 0 }, then: { do: 'delete_database', value: 0 } },
      { when: { on: 'fight_start', value: 0 }, then: { do: 'immune', value: 0 } },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].when.on).toBe('fight_start')
  })

  it('clamps values into the range each action can actually execute', () => {
    const [big] = normalizeRules([
      { when: { on: 'first_turns', value: 9999 }, then: { do: 'heal_self', value: 1e12 } },
    ])
    expect(big.when.value).toBe(14)
    expect(big.then.value).toBe(999)

    const [negative] = normalizeRules([
      { when: { on: 'my_hp_below', value: -50 }, then: { do: 'damage_taken_mult', value: -3 } },
    ])
    expect(negative.when.value).toBe(1)
    expect(negative.then.value).toBe(0)
  })

  it('survives non-numeric and missing values by falling back', () => {
    const [r] = normalizeRules([
      { when: { on: 'coin_flip', value: 'often' }, then: { do: 'hurt_them' } },
    ])
    expect(Number.isFinite(r.when.value)).toBe(true)
    expect(Number.isFinite(r.then.value)).toBe(true)
    expect(r.chance).toBe(100)
    expect(r.times).toBe(0)
  })

  it('truncates to MAX_RULES', () => {
    const many = Array.from({ length: 40 }, () => ({
      when: { on: 'fight_start', value: 0 },
      then: { do: 'guard', value: 0 },
    }))
    expect(normalizeRules(many)).toHaveLength(MAX_RULES)
  })

  it('fills in a pressure track and a move effect when the model omits them', () => {
    const [p] = normalizeRules([
      { when: { on: 'fight_start', value: 0 }, then: { do: 'pressure_add', value: 10 } },
    ])
    expect(PRESSURE_TRACKS).toContain(p.then.track)

    const [e] = normalizeRules([
      { when: { on: 'when_they_use', value: 0 }, then: { do: 'immune', value: 0 } },
    ])
    expect(e.when.effect).toBe('damage')
  })

  it('is idempotent', () => {
    const once = normalizeRules([
      { when: { on: 'when_i_miss', value: 0 }, then: { do: 'boost_atk', value: 3 }, times: 2 },
    ])
    expect(normalizeRules(once)).toEqual(once)
  })

  it('rounds everything except the multipliers', () => {
    const [heal] = normalizeRules([
      { when: { on: 'fight_start', value: 0 }, then: { do: 'heal_self', value: 12.7 } },
    ])
    expect(heal.then.value).toBe(13)

    const [mult] = normalizeRules([
      { when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'damage_taken_mult', value: 0.25 } },
    ])
    expect(mult.then.value).toBe(0.25)
  })
})

describe('describeRule', () => {
  it('produces a sentence for every trigger and every action', () => {
    for (const on of RULE_TRIGGERS) {
      for (const doing of RULE_ACTIONS) {
        const [r] = normalizeRules([{ when: { on, value: 3 }, then: { do: doing, value: 2 } }])
        const text = describeRule(r)
        expect(typeof text).toBe('string')
        expect(text.length).toBeGreaterThan(0)
        expect(text.endsWith('.')).toBe(true)
        expect(text).not.toContain('undefined')
        expect(text).not.toContain('NaN')
      }
    }
  })

  it('every trigger is pinned to a hook', () => {
    for (const on of RULE_TRIGGERS) {
      expect(TRIGGER_HOOK[on]).toBeTruthy()
    }
  })
})

describe('a fighter with no rules', () => {
  it('simulates identically whether the field is absent or empty', () => {
    const withField = simulate(fighter('A', []), fighter('B', []), 12345)
    const a = fighter('A')
    const b = fighter('B')
    delete a.rules
    delete b.rules
    const without = simulate(a, b, 12345)
    expect(without).toEqual(withField)
  })

  it('is unaffected across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const a = fighter('A')
      const b = fighter('B')
      delete a.rules
      delete b.rules
      expect(simulate(a, b, seed)).toEqual(simulate(fighter('A', []), fighter('B', []), seed))
    }
  })
})

describe('termination', () => {
  /**
   * The adversarial cases. Each of these is a fighter built specifically to run
   * forever — immortal, self-healing, reviving without limit, or all three — and
   * the point of every assertion is the same: the loop bound in sim.ts is not
   * something a rule can reach.
   */
  const IMMORTAL: Rule[] = [
    rule({ when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 } }),
    rule({ when: { on: 'my_turn', value: 0 }, then: { do: 'heal_pct', value: 100 } }),
    rule({ when: { on: 'when_i_would_fall', value: 0 }, then: { do: 'revive', value: 100 } }),
  ]

  const PACIFIST: Rule[] = [
    rule({ when: { on: 'my_turn', value: 0 }, then: { do: 'skip_my_turn', value: 0 } }),
  ]

  it('two immortals still produce a winner and a bounded log', () => {
    for (let seed = 0; seed < 300; seed++) {
      const result = simulate(fighter('A', IMMORTAL), fighter('B', IMMORTAL), seed)
      expect(result.winner === 'a' || result.winner === 'b').toBe(true)
      expect(result.log.length).toBeLessThanOrEqual(MAX_LOG)
    }
  })

  it('two fighters who never act still produce a winner', () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = simulate(fighter('A', PACIFIST), fighter('B', PACIFIST), seed)
      expect(result.winner === 'a' || result.winner === 'b').toBe(true)
      expect(result.log.length).toBeLessThanOrEqual(MAX_LOG)
    }
  })

  it('an immortal against a pacifist terminates', () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = simulate(fighter('A', IMMORTAL), fighter('B', PACIFIST), seed)
      expect(result.log.length).toBeLessThanOrEqual(MAX_LOG)
    }
  })

  /**
   * The blunt instrument: every action, at every trigger, on both fighters at
   * once, across a spread of magnitudes. This is not a fight anyone would build
   * — it is the shape of the space, and the assertion is only that the engine
   * comes out the other side with a legal result and no exception.
   */
  it('holds for every trigger crossed with every action', () => {
    let seed = 0
    for (const on of RULE_TRIGGERS) {
      for (const doing of RULE_ACTIONS) {
        for (const value of [0, 1, 3, 100]) {
          const rules = normalizeRules([
            { when: { on, value }, then: { do: doing, value, track: 'crowd' }, chance: 100, times: 0 },
          ])
          const result = simulate(fighter('A', rules), fighter('B', rules), seed++)

          expect(result.winner === 'a' || result.winner === 'b').toBe(true)
          expect(result.log.length).toBeLessThanOrEqual(MAX_LOG)
          expect(result.log.length).toBeGreaterThan(0)
          for (const beat of result.log) {
            expect(beat.hp.a).toBeGreaterThanOrEqual(0)
            expect(beat.hp.b).toBeGreaterThanOrEqual(0)
            expect(Number.isFinite(beat.hp.a)).toBe(true)
            expect(Number.isFinite(beat.hp.b)).toBe(true)
            expect(Number.isFinite(beat.damage)).toBe(true)
            expect(beat.damage).toBeGreaterThanOrEqual(0)
            const words = [beat.text, ...beat.rules].join(' ')
            expect(words).not.toContain('undefined')
            expect(words).not.toContain('NaN')
          }
        }
      }
    }
  })

  it('holds for random six-rule fighters', () => {
    const rng = makeRng(99)
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]

    for (let i = 0; i < 400; i++) {
      const build = () =>
        normalizeRules(
          Array.from({ length: MAX_RULES }, () => ({
            when: { on: pick(RULE_TRIGGERS) as RuleTrigger, value: Math.floor(rng() * 120) },
            then: {
              do: pick(RULE_ACTIONS) as RuleAction,
              value: rng() * 200 - 50,
              track: pick(PRESSURE_TRACKS),
            },
            chance: Math.floor(rng() * 101),
            times: Math.floor(rng() * 5),
          })),
        )

      const result = simulate(fighter('A', build()), fighter('B', build()), i)
      expect(result.winner === 'a' || result.winner === 'b').toBe(true)
      expect(result.log.length).toBeLessThanOrEqual(MAX_LOG)
      expect(result.maxHp.a).toBeGreaterThan(0)
      expect(result.maxHp.b).toBeGreaterThan(0)
    }
  })
})

describe('the rules actually do what they say', () => {
  it('immune means zero damage, not less damage', () => {
    const wall = fighter('Wall', [
      rule({
        name: 'Untouched',
        when: { on: 'when_i_am_hit', value: 0 },
        then: { do: 'immune', value: 0 },
      }),
    ])
    const puncher = fighter('Puncher')

    for (let seed = 0; seed < 50; seed++) {
      const result = simulate(puncher, wall, seed)
      // Every beat where 'a' acted did nothing to 'b'.
      for (const beat of result.log) {
        if (beat.actor === 'a') expect(beat.damage).toBe(0)
      }
      // And so the wall is untouched at the final bell.
      expect(result.log[result.log.length - 1].hp.b).toBe(result.maxHp.b)
    }
  })

  it('win_now at the bell ends the fight before anyone throws a punch', () => {
    const cheat = fighter('Cheat', [
      rule({
        name: 'Already Over',
        text: 'The bell rings. It is done.',
        when: { on: 'fight_start', value: 0 },
        then: { do: 'win_now', value: 0 },
      }),
    ])

    for (let seed = 0; seed < 20; seed++) {
      const result = simulate(cheat, fighter('Victim'), seed)
      expect(result.winner).toBe('a')
      expect(result.decision).toBe(false)
      // The opening beat, and the beat that records the fall. Nothing else.
      expect(result.log.length).toBeLessThanOrEqual(2)
      expect(result.log[0].rules.join(' ')).toContain('Already Over')
    }
  })

  it('revive keeps a fighter up, and `times` caps how often', () => {
    const once = fighter(
      'Phoenix',
      [
        rule({
          name: 'One More',
          when: { on: 'when_i_would_fall', value: 0 },
          then: { do: 'revive', value: 50 },
          times: 1,
        }),
      ],
      { ...FLAT, hp: 3, def: 3 },
    )
    const heavy = fighter('Hammer', [], { ...FLAT, atk: 12, hp: 12 })

    // Over a spread of seeds the revive fires and is spent; the fighter never
    // comes back a second time, so the fight still ends with them down.
    let revives = 0
    for (let seed = 0; seed < 100; seed++) {
      const result = simulate(once, heavy, seed)
      if (result.log.some((b) => b.rules.join(' ').includes('One More'))) revives += 1
      expect(result.log.filter((b) => b.rules.join(' ').includes('One More')).length).toBeLessThanOrEqual(1)
    }
    expect(revives).toBeGreaterThan(0)
  })

  it('silence_them switches the opponent off', () => {
    const silencer = fighter('Hush', [
      rule({
        name: 'Hush',
        when: { on: 'fight_start', value: 0 },
        then: { do: 'silence_them', value: 0 },
      }),
    ])
    // 'a' silences at the bell, so 'b' is silenced before its own start rules
    // would have run — order within the opening beat is a, then b.
    const wall = fighter('Wall', [
      rule({
        name: 'Untouched',
        when: { on: 'when_i_am_hit', value: 0 },
        then: { do: 'immune', value: 0 },
      }),
    ])

    const result = simulate(silencer, wall, 7)
    expect(result.log.some((b) => b.rules.join(' ').includes('Untouched'))).toBe(false)
    // And with the immunity switched off, hits land.
    expect(result.log.some((b) => b.actor === 'a' && b.damage > 0)).toBe(true)
  })

  it('boost_atk stacks and makes later hits harder', () => {
    const rager = fighter('Rager', [
      rule({
        name: 'Spite',
        when: { on: 'my_turn', value: 0 },
        then: { do: 'boost_atk', value: 4 },
      }),
    ])

    const plain = simulate(fighter('Plain'), fighter('Target'), 4242)
    const raged = simulate(rager, fighter('Target'), 4242)

    // Compared beat-for-beat at the same index, not in aggregate. Totals and
    // maxima both mislead here: a fighter who hits harder ends the bout sooner,
    // so it lands fewer blows and may never reach its signature at all — the
    // raged fight can deal less damage overall precisely *because* the rule
    // worked. Rules draw from their own RNG stream, so the physical rolls on a
    // given beat are identical between these two fights and the only difference
    // at the same index is the attack stat.
    const index = plain.log.findIndex((b) => b.actor === 'a' && b.damage > 0)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(raged.log[index].damage).toBeGreaterThan(plain.log[index].damage)
  })

  it('a rule with chance below 100 fires sometimes and not always', () => {
    const flaky = fighter('Flaky', [
      rule({
        name: 'Sometimes',
        when: { on: 'my_turn', value: 0 },
        then: { do: 'heal_self', value: 5 },
        chance: 50,
      }),
    ])

    let fired = 0
    let quiet = 0
    for (let seed = 0; seed < 100; seed++) {
      const result = simulate(flaky, fighter('Other'), seed)
      const hits = result.log.filter((b) => b.rules.join(' ').includes('Sometimes')).length
      const beats = result.log.filter((b) => b.actor === 'a').length
      if (hits > 0) fired += 1
      if (hits < beats) quiet += 1
    }
    expect(fired).toBeGreaterThan(0)
    expect(quiet).toBeGreaterThan(0)
  })

  it("one fighter's rules never move the other's physical rolls", () => {
    // 'b' has a rule that only ever fires on 'b'. The damage 'a' deals is drawn
    // from the sim's stream, which the rules stream must not touch — so 'a'
    // rolls identically whether or not 'b' has rules at all.
    const talker = fighter('B', [
      rule({
        name: 'Chatter',
        when: { on: 'my_turn', value: 0 },
        then: { do: 'pressure_add', value: 1 },
      }),
    ])

    const bare = simulate(fighter('A'), fighter('B'), 31337)
    const withRules = simulate(fighter('A'), talker, 31337)

    const firstA = (r: typeof bare) => r.log.find((b) => b.actor === 'a')
    expect(firstA(withRules)?.damage).toBe(firstA(bare)?.damage)
  })
})
