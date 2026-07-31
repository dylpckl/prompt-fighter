import { describe, expect, it } from 'vitest'
import {
  ValidationError,
  hydrateFighter,
  normalizeFlaw,
  normalizeMove,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
} from '../src/lib/engine/validate'
import {
  PALETTE_SIZE,
  SPIRIT_DEFAULT,
  SPIRIT_MAX,
  SPIRIT_MIN,
  SPIRIT_TOTAL,
  SPRITE_SIZE,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from '../src/lib/engine/types'

const sum = (s: { hp: number; atk: number; def: number; spd: number }) =>
  s.hp + s.atk + s.def + s.spd

const spiritSum = (s: { cha: number; wil: number; arc: number; luk: number }) =>
  s.cha + s.wil + s.arc + s.luk

describe('normalizeStats', () => {
  it('keeps a valid spread untouched', () => {
    const stats = { hp: 9, atk: 8, def: 7, spd: 6 }
    // Spirit is a separate budget, so it gets backfilled; the body four survive.
    expect(normalizeStats(stats)).toMatchObject(stats)
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

describe('normalizeStats — spirit budget', () => {
  const legalSpirit = { cha: 9, wil: 6, arc: 3, luk: 2 }
  const legalBody = { hp: 9, atk: 8, def: 7, spd: 6 }

  it('keeps a valid spirit spread untouched', () => {
    expect(normalizeStats({ ...legalBody, ...legalSpirit })).toEqual({
      ...legalBody,
      ...legalSpirit,
    })
  })

  it('claws back a spirit spread that overspends', () => {
    const stats = normalizeStats({ ...legalBody, cha: 10, wil: 10, arc: 10, luk: 10 })
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('tops up a spirit spread that underspends', () => {
    const stats = normalizeStats({ ...legalBody, cha: 2, wil: 2, arc: 2, luk: 2 })
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('clamps spirit values into range', () => {
    const stats = normalizeStats({ ...legalBody, cha: 999, wil: -12, arc: 4, luk: 4 })
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
    for (const key of ['cha', 'wil', 'arc', 'luk'] as const) {
      expect(stats[key]).toBeGreaterThanOrEqual(SPIRIT_MIN)
      expect(stats[key]).toBeLessThanOrEqual(SPIRIT_MAX)
    }
  })

  it('survives junk and missing spirit values', () => {
    const stats = normalizeStats({ ...legalBody, cha: 'seven', wil: null, arc: NaN })
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
    for (const key of ['cha', 'wil', 'arc', 'luk'] as const) {
      expect(Number.isInteger(stats[key])).toBe(true)
      expect(stats[key]).toBeGreaterThanOrEqual(SPIRIT_MIN)
      expect(stats[key]).toBeLessThanOrEqual(SPIRIT_MAX)
    }
  })

  it('gives a legacy four-key fighter a legal flat spirit spread', () => {
    // Exactly what comes back out of a fighters row written before spirit stats.
    const stats = normalizeStats(legalBody)
    expect(stats).toEqual({
      ...legalBody,
      cha: SPIRIT_DEFAULT,
      wil: SPIRIT_DEFAULT,
      arc: SPIRIT_DEFAULT,
      luk: SPIRIT_DEFAULT,
    })
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('holds both budgets at once from nothing at all', () => {
    const stats = normalizeStats(undefined)
    expect(sum(stats)).toBe(STAT_TOTAL)
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('does not let an overspent spirit budget touch the body total', () => {
    const stats = normalizeStats({ ...legalBody, cha: 10, wil: 10, arc: 10, luk: 10 })
    expect(sum(stats)).toBe(STAT_TOTAL)
    expect(stats).toMatchObject(legalBody)
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('does not let an overspent body budget touch the spirit total', () => {
    const stats = normalizeStats({ hp: 12, atk: 12, def: 12, spd: 12, ...legalSpirit })
    expect(sum(stats)).toBe(STAT_TOTAL)
    expect(stats).toMatchObject(legalSpirit)
    expect(spiritSum(stats)).toBe(SPIRIT_TOTAL)
  })

  it('does not let an underspent body budget fund spirit, or the reverse', () => {
    const starved = normalizeStats({ hp: 3, atk: 3, def: 3, spd: 3, ...legalSpirit })
    expect(sum(starved)).toBe(STAT_TOTAL)
    expect(starved).toMatchObject(legalSpirit)

    const drained = normalizeStats({ ...legalBody, cha: 2, wil: 2, arc: 2, luk: 2 })
    expect(drained).toMatchObject(legalBody)
    expect(spiritSum(drained)).toBe(SPIRIT_TOTAL)
  })
})

describe('hydrateFighter', () => {
  const row = {
    id: 'abc',
    name: 'Test',
    title: 'The Tested',
    moves: [{ name: 'Jab', power: 4, effect: 'damage' }],
    flaw: { name: 'Glass', effect: 'glass' },
    sprite: { palette: [], rows: [] },
    wins: 3,
    losses: 1,
  }

  it('leaves an already-normalized row byte-identical', () => {
    // The read path runs on every fight, so it must not quietly restat anyone
    // who was written since the spirit budget landed.
    const stats = { hp: 9, atk: 8, def: 7, spd: 6, cha: 7, wil: 6, arc: 4, luk: 3 }
    expect(hydrateFighter({ ...row, stats }).stats).toEqual(stats)
  })

  it('gives a pre-spirit row exactly what the sim already assumed', () => {
    // sim.ts falls back to SPIRIT_DEFAULT for a missing key. If hydration
    // disagreed, the stat panel would show numbers the fight never used.
    const hydrated = hydrateFighter({ ...row, stats: { hp: 9, atk: 8, def: 7, spd: 6 } })
    expect(hydrated.stats).toEqual({
      hp: 9,
      atk: 8,
      def: 7,
      spd: 6,
      cha: SPIRIT_DEFAULT,
      wil: SPIRIT_DEFAULT,
      arc: SPIRIT_DEFAULT,
      luk: SPIRIT_DEFAULT,
    })
  })

  it('carries the rest of the row through untouched', () => {
    const hydrated = hydrateFighter({ ...row, stats: {} })
    expect(hydrated.name).toBe('Test')
    expect(hydrated.wins).toBe(3)
    expect(hydrated.sprite).toEqual({ palette: [], rows: [] })
  })

  /**
   * `session_id` is the app's only authorization token — /api/fight and the room
   * join both prove ownership with `.eq('session_id', …)` — while fighter ids
   * are published by the leaderboard and by every room. A row that carries the
   * token out next to the id it protects lets anyone enter, and then drive the
   * record of, a fighter they do not own. Column projection is the first line;
   * this is the one that also covers `pick_ghost`, which returns `setof
   * fighters` and cannot be projected at the query.
   */
  it('never carries a session id or the raw prompts out of the database', () => {
    const hydrated = hydrateFighter({
      ...row,
      stats: {},
      session_id: '11111111-2222-3333-4444-555555555555',
      prompts: { body: 'b', weapon: 'w', move: 'm', flaw: 'f' },
    })

    expect(Object.keys(hydrated)).not.toContain('session_id')
    expect(Object.keys(hydrated)).not.toContain('prompts')
    expect(JSON.stringify(hydrated)).not.toContain('5555')
  })

  it('does not mutate the row it was handed', () => {
    const source = { ...row, stats: {}, session_id: 'keep-me' }
    hydrateFighter(source)
    expect(source.session_id).toBe('keep-me')
  })

  // The projection itself is covered in tests/fighters.test.ts, next to the
  // constant it asserts about.
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
