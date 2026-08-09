import { describe, it, expect } from 'vitest'
import { normalizeRules } from '../src/lib/engine/rules'

const rule = (over: object) => ({
  name: 'X', text: 'x',
  when: { on: 'when_i_am_hit', value: 0 },
  then: { do: 'immune', value: 0 },
  chance: 65, times: 3, ...over,
})

describe('absolutes stay absolute (code, not model)', () => {
  it('forces chance=100/times=0 for immune on an unconditional trigger', () => {
    const [r] = normalizeRules([rule({})])
    expect([r.chance, r.times]).toEqual([100, 0])
  })
  it('leaves a CONDITIONALLY-triggered immune hedged as written', () => {
    const [r] = normalizeRules([rule({ when: { on: 'my_hp_below', value: 30 }, chance: 50, times: 2 })])
    expect([r.chance, r.times]).toEqual([50, 2])
  })
  it('does NOT force win_now (a low-odds instakill is a real design)', () => {
    const [r] = normalizeRules([rule({ then: { do: 'win_now', value: 0 }, when: { on: 'when_i_attack', value: 0 }, chance: 5 })])
    expect(r.chance).toBe(5)
  })
  it('preserves the marquee flag', () => {
    const [r] = normalizeRules([rule({ marquee: true })])
    expect(r.marquee).toBe(true)
  })
})
