import { describe, it, expect } from 'vitest'
import { assembleRules } from '../src/lib/engine/assemble'
const bg = { name: 'Grudge', text: 'stronger on a miss', when: { on: 'when_i_miss', value: 0 }, then: { do: 'boost_atk', value: 2 }, chance: 100, times: 0 }
const special = { name: 'Ward', text: 'nothing gets through',
  rule: { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 100, times: 0 } }
describe('assembleRules', () => {
  it('marks the chosen Special marquee and keeps background', () => {
    const out = assembleRules([bg as never], special as never)
    expect(out.find((r) => r.marquee)?.name).toBe('Ward')
    expect(out.some((r) => r.name === 'Grudge' && !r.marquee)).toBe(true)
  })
  it('dedups a background rule identical to the marquee (no stacking)', () => {
    const dupe = { ...special.rule, name: 'Ward', text: 'nothing gets through' }
    const out = assembleRules([dupe as never], special as never)
    expect(out.filter((r) => r.then.do === 'immune')).toHaveLength(1)
  })
  it('null chosen → background only, no marquee', () => {
    const out = assembleRules([bg as never], null)
    expect(out.some((r) => r.marquee)).toBe(false)
  })
  it('caps at six', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...bg, name: `r${i}` }))
    expect(assembleRules(many as never, special as never).length).toBeLessThanOrEqual(6)
  })
})
