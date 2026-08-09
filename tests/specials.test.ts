import { describe, it, expect } from 'vitest'
import { normalizeSpecials } from '../src/lib/engine/specials'
const one = { name: 'Ward', flavor: 'nothing gets through',
  rule: { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 60, times: 2 } }
describe('normalizeSpecials', () => {
  it('keeps 0..3 well-formed specials and normalizes the rule (immune→total)', () => {
    const [s] = normalizeSpecials([one])
    expect(s.name).toBe('Ward')
    expect([s.rule.chance, s.rule.times]).toEqual([100, 0]) // via normalizeRules
  })
  it('drops malformed entries, caps at three, and returns [] for non-arrays', () => {
    expect(normalizeSpecials([one, one, one, one, { junk: 1 }]).length).toBe(3)
    expect(normalizeSpecials(null)).toEqual([])
    expect(normalizeSpecials([])).toEqual([])
  })
})
