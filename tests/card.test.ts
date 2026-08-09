import { describe, it, expect } from 'vitest'
import { cardModel } from '../src/lib/engine/card'
import type { Fighter } from '../src/lib/engine/types'

const base = {
  id: 'x', name: 'Nan', title: 'the Warded',
  stats: { hp: 8, atk: 12, def: 7, spd: 3, cha: 8, wil: 6, arc: 4, luk: 2 },
  moves: [{ name: 'Backhand', power: 5, effect: 'damage' }, { name: 'Grudge', power: 9, effect: 'heavy' }],
  flaw: { name: 'Glass Jaw', effect: 'glass' },
  sprite: { palette: [], rows: [] }, wins: 0, losses: 0, favorites: 0,
} as unknown as Fighter

describe('cardModel', () => {
  it('exposes four bars, both move names, and the flaw name — no numbers', () => {
    const m = cardModel({ ...base, rules: [] } as Fighter)
    expect(m.bars.map((b) => b.key)).toEqual(['power', 'speed', 'toughness', 'spirit'])
    expect(m.moveNames).toEqual(['Backhand', 'Grudge'])
    expect(m.flawName).toBe('Glass Jaw')
    expect(m.special).toBeNull()
  })
  it('surfaces the marquee rule as the Special (name + flavor)', () => {
    const rules = [
      { name: 'Grudge Engine', text: 'stronger on a miss', when: { on: 'when_i_miss', value: 0 }, then: { do: 'boost_atk', value: 2 }, chance: 100, times: 0 },
      { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 100, times: 0, marquee: true },
    ]
    expect(cardModel({ ...base, rules } as Fighter).special).toEqual({ name: 'Ward', text: 'nothing gets through' })
  })
})
