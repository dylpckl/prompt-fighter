import { describe, expect, it } from 'vitest'
import {
  ValidationError,
  normalizeFlaw,
  normalizeMove,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
} from '../src/lib/engine/validate'
import {
  PALETTE_SIZE,
  SPRITE_SIZE,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from '../src/lib/engine/types'

const sum = (s: { hp: number; atk: number; def: number; spd: number }) =>
  s.hp + s.atk + s.def + s.spd

describe('normalizeStats', () => {
  it('keeps a valid spread untouched', () => {
    const stats = { hp: 9, atk: 8, def: 7, spd: 6 }
    expect(normalizeStats(stats)).toEqual(stats)
  })

  it('claws back a spread that overspends the budget', () => {
    const stats = normalizeStats({ hp: 12, atk: 12, def: 12, spd: 12 })
    expect(sum(stats)).toBe(STAT_TOTAL)
  })

  it('tops up a spread that underspends', () => {
    const stats = normalizeStats({ hp: 3, atk: 3, def: 3, spd: 3 })
    expect(sum(stats)).toBe(STAT_TOTAL)
  })

  it('clamps out-of-range and junk values', () => {
    const stats = normalizeStats({ hp: 999, atk: -40, def: 'nine', spd: null })
    expect(sum(stats)).toBe(STAT_TOTAL)
    for (const value of Object.values(stats)) {
      expect(value).toBeGreaterThanOrEqual(STAT_MIN)
      expect(value).toBeLessThanOrEqual(STAT_MAX)
    }
  })

  it('survives a missing object entirely', () => {
    expect(sum(normalizeStats(undefined))).toBe(STAT_TOTAL)
  })
})

describe('normalizeMove', () => {
  it('holds power inside the band for its kind', () => {
    expect(normalizeMove({ name: 'Tap', power: 10, effect: 'damage' }, 'basic').power).toBe(6)
    expect(normalizeMove({ name: 'Doom', power: 1, effect: 'damage' }, 'special').power).toBe(6)
  })

  it('falls back to plain damage for an unknown effect', () => {
    expect(normalizeMove({ name: 'X', power: 4, effect: 'instant_win' }, 'basic').effect).toBe(
      'damage',
    )
  })

  it('supplies a name when one is missing', () => {
    expect(normalizeMove({}, 'special').name).toBe('Finisher')
  })
})

describe('normalizeFlaw', () => {
  it('rejects an invented effect', () => {
    expect(normalizeFlaw({ name: 'None at all', effect: 'invincible' }).effect).toBe('glass')
  })
})

describe('normalizeSprite', () => {
  const solidRows = Array.from({ length: SPRITE_SIZE }, () => '1'.repeat(SPRITE_SIZE))
  const palette = Array.from({ length: PALETTE_SIZE }, () => '#112233')

  it('returns exactly the expected dimensions', () => {
    const sprite = normalizeSprite(palette, solidRows)
    expect(sprite.palette).toHaveLength(PALETTE_SIZE)
    expect(sprite.rows).toHaveLength(SPRITE_SIZE)
    for (const row of sprite.rows) expect(row).toHaveLength(SPRITE_SIZE)
  })

  it('pads short rows and truncates long ones', () => {
    const ragged = [...solidRows]
    ragged[0] = '11'
    ragged[1] = '1'.repeat(40)
    const sprite = normalizeSprite(palette, ragged)

    expect(sprite.rows[0]).toBe('11' + '0'.repeat(SPRITE_SIZE - 2))
    expect(sprite.rows[1]).toHaveLength(SPRITE_SIZE)
  })

  it('replaces out-of-range indices and bad colors', () => {
    const rows = [...solidRows]
    rows[2] = '9abcdefg' + '1'.repeat(SPRITE_SIZE - 8)
    const sprite = normalizeSprite(['not-a-color', ...palette.slice(1)], rows)

    expect(sprite.rows[2].slice(0, 8)).toBe('00000000')
    expect(sprite.palette[0]).toBe('#000000')
  })

  it('rejects a sprite with almost nothing drawn', () => {
    const blank = Array.from({ length: SPRITE_SIZE }, () => '0'.repeat(SPRITE_SIZE))
    expect(() => normalizeSprite(palette, blank)).toThrow(ValidationError)
  })
})

describe('parsePrompts', () => {
  const valid = { body: 'a', weapon: 'b', move: 'c', flaw: 'd' }

  it('trims and accepts a complete set', () => {
    expect(parsePrompts({ ...valid, body: '  padded  ' }).body).toBe('padded')
  })

  it('rejects a missing slot', () => {
    expect(() => parsePrompts({ body: 'a', weapon: 'b', move: 'c' })).toThrow(ValidationError)
  })

  it('rejects an empty slot', () => {
    expect(() => parsePrompts({ ...valid, flaw: '   ' })).toThrow(ValidationError)
  })

  it('rejects an over-long slot', () => {
    expect(() => parsePrompts({ ...valid, body: 'x'.repeat(81) })).toThrow(ValidationError)
  })
})
