import { describe, expect, it } from 'vitest'
import {
  BEAT_MS,
  OUTRO_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_SIZES,
  bracketSize,
  buildFirstRound,
  matchDurationMs,
  matchSeed,
  parseRoomCode,
  parseRoomSize,
  roomCodeFrom,
  roundsFor,
  shuffleSeats,
  standardSeedOrder,
} from '../src/lib/engine/bracket'
import { ValidationError } from '../src/lib/engine/validate'
import { makeRng } from '../src/lib/engine/rng'

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `f${i}`)
}

describe('room codes', () => {
  it('never contains an ambiguous character', () => {
    for (const bad of ['O', '0', 'I', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(bad)
    }
  })

  it('builds a code of the right length from the alphabet only', () => {
    const rng = makeRng(7)
    const code = roomCodeFrom((max) => Math.floor(rng() * max))
    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch)
  })

  it('accepts a lowercase code and normalizes it', () => {
    expect(parseRoomCode('a2b3')).toBe('A2B3')
    expect(parseRoomCode('  A2B3 ')).toBe('A2B3')
  })

  it('rejects wrong lengths, ambiguous characters and non-strings', () => {
    for (const bad of ['ABC', 'ABCDE', 'A0BC', 'AIBC', '', null, 42, undefined]) {
      expect(() => parseRoomCode(bad)).toThrow(ValidationError)
    }
  })
})

describe('parseRoomSize', () => {
  it('takes the three legal sizes', () => {
    for (const size of ROOM_SIZES) expect(parseRoomSize(size)).toBe(size)
    expect(parseRoomSize('8')).toBe(8)
  })

  it('rejects anything else', () => {
    for (const bad of [0, 2, 5, 32, 'lots', null]) {
      expect(() => parseRoomSize(bad)).toThrow(ValidationError)
    }
  })
})

describe('bracketSize', () => {
  it('rounds up to a power of two, never below two', () => {
    expect(bracketSize(1)).toBe(2)
    expect(bracketSize(2)).toBe(2)
    expect(bracketSize(3)).toBe(4)
    expect(bracketSize(5)).toBe(8)
    expect(bracketSize(8)).toBe(8)
    expect(bracketSize(9)).toBe(16)
    expect(bracketSize(16)).toBe(16)
  })

  it('agrees with roundsFor', () => {
    for (const [size, rounds] of [[2, 1], [4, 2], [8, 3], [16, 4]]) {
      expect(roundsFor(size)).toBe(rounds)
    }
  })
})

describe('standardSeedOrder', () => {
  it('produces the classic ordering', () => {
    expect(standardSeedOrder(2)).toEqual([1, 2])
    expect(standardSeedOrder(4)).toEqual([1, 4, 2, 3])
    expect(standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('uses every position exactly once and pairs them to sum size+1', () => {
    for (const size of [2, 4, 8, 16]) {
      const order = standardSeedOrder(size)
      expect(new Set(order).size).toBe(size)
      for (let i = 0; i < size; i += 2) {
        expect(order[i] + order[i + 1]).toBe(size + 1)
      }
    }
  })
})

describe('shuffleSeats', () => {
  it('is a permutation and is deterministic in the seed', () => {
    const source = ids(9)
    const once = shuffleSeats(source, 12345)
    expect([...once].sort()).toEqual([...source].sort())
    expect(shuffleSeats(source, 12345)).toEqual(once)
  })

  it('does not mutate its input', () => {
    const source = ids(6)
    shuffleSeats(source, 99)
    expect(source).toEqual(ids(6))
  })

  it('actually moves things for at least some seeds', () => {
    const source = ids(12)
    const moved = [1, 2, 3, 4, 5].some((seed) => shuffleSeats(source, seed).join() !== source.join())
    expect(moved).toBe(true)
  })
})

describe('buildFirstRound', () => {
  it('gives a five-person room a playable eight bracket with three byes', () => {
    const { size, rounds, pairings } = buildFirstRound(ids(5), 4242)
    expect(size).toBe(8)
    expect(rounds).toBe(3)
    expect(pairings).toHaveLength(4)

    const byes = pairings.filter((p) => (p.a === null) !== (p.b === null))
    expect(byes).toHaveLength(3)
  })

  it('never pairs two empty positions, for any field size', () => {
    for (let count = 2; count <= 16; count++) {
      for (let seed = 0; seed < 12; seed++) {
        const { size, pairings } = buildFirstRound(ids(count), seed * 977 + 1)

        // Every entrant appears exactly once.
        const placed = pairings.flatMap((p) => [p.a, p.b]).filter((x): x is string => x !== null)
        expect([...placed].sort()).toEqual(ids(count).sort())
        expect(pairings).toHaveLength(size / 2)

        // A match with nobody in it would deadlock the advance.
        for (const p of pairings) expect(p.a === null && p.b === null).toBe(false)
      }
    }
  })

  it('is fully determined by the seed', () => {
    expect(buildFirstRound(ids(11), 555)).toEqual(buildFirstRound(ids(11), 555))
  })

  it('slots are contiguous from zero', () => {
    const { pairings } = buildFirstRound(ids(13), 8)
    expect(pairings.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('matchSeed', () => {
  it('is deterministic and stays inside the sim seed range', () => {
    for (let round = 1; round <= 4; round++) {
      for (let slot = 0; slot < 8; slot++) {
        const seed = matchSeed(123456, round, slot)
        expect(seed).toBe(matchSeed(123456, round, slot))
        expect(Number.isInteger(seed)).toBe(true)
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThan(2 ** 31)
      }
    }
  })

  it('gives every position in the bracket a different seed', () => {
    const seen = new Set<number>()
    for (let round = 1; round <= 4; round++) {
      for (let slot = 0; slot < 8; slot++) seen.add(matchSeed(987654, round, slot))
    }
    expect(seen.size).toBe(32)
  })
})

describe('matchDurationMs', () => {
  it('is one beat per log entry plus the victory hold', () => {
    expect(matchDurationMs(0)).toBe(OUTRO_MS)
    expect(matchDurationMs(10)).toBe(10 * BEAT_MS + OUTRO_MS)
  })
})
