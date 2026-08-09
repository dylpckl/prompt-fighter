import { describe, it, expect, beforeAll } from 'vitest'
import { signCandidate, verifyCandidate } from '../src/lib/server/sign'
beforeAll(() => { process.env.FIGHTER_SIGNING_SECRET = 'test-secret' })
describe('candidate signing', () => {
  it('verifies an unmodified payload and rejects a tampered one', () => {
    const payload = { stats: { atk: 5 }, specials: [{ name: 'A' }] }
    const sig = signCandidate(payload)
    expect(verifyCandidate(payload, sig)).toBe(true)
    expect(verifyCandidate({ ...payload, stats: { atk: 99 } }, sig)).toBe(false)
  })
  it('is stable across key order (canonical)', () => {
    expect(signCandidate({ a: 1, b: 2 })).toBe(signCandidate({ b: 2, a: 1 }))
  })
})
