import { describe, it, expect } from 'vitest'
import { faceBars } from '../src/lib/engine/face'
import { STAT_MAX, SPIRIT_MAX } from '../src/lib/engine/types'

// body 8+12+7+3 = 30; spirit 8+6+4+2 = 20 (both legal budgets)
const stats = { hp: 8, atk: 12, def: 7, spd: 3, cha: 8, wil: 6, arc: 4, luk: 2 }

describe('faceBars', () => {
  it('produces exactly four bars in order', () => {
    expect(faceBars(stats).map((b) => b.key)).toEqual(['power', 'speed', 'toughness', 'spirit'])
  })
  it('maps raw stats to abstracted values and ceilings', () => {
    const [power, speed, tough, spirit] = faceBars(stats)
    expect([power.value, power.max]).toEqual([12, STAT_MAX])
    expect(speed.value).toBe(3)
    expect([tough.value, tough.max]).toEqual([15, STAT_MAX * 2]) // hp 8 + def 7
    expect([spirit.value, spirit.max]).toEqual([8, SPIRIT_MAX])   // peak = cha 8
  })
  it('labels the spirit bar with the peak stat name', () => {
    expect(faceBars(stats)[3].label).toBe('Presence') // cha is the peak
    expect(faceBars({ ...stats, cha: 2, luk: 8 })[3].label).toBe('Fate') // luk peak
  })
  it('every value stays within its own ceiling', () => {
    for (const b of faceBars(stats)) expect(b.value / b.max).toBeLessThanOrEqual(1)
  })
})
