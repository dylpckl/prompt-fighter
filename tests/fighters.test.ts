import { describe, expect, it } from 'vitest'
import { PUBLIC_FIGHTER_COLUMNS, toPublicFighter } from '../src/lib/server/fighters'

/**
 * session_id is the only credential this app has — holding someone else's lets
 * you fight with their fighter and move its record. These guard the two ways a
 * row can reach a client.
 */
describe('toPublicFighter', () => {
  const row = {
    id: 'f1',
    session_id: 'secret-session',
    name: 'Test',
    title: 'The Tested',
    prompts: { body: 'a', weapon: 'b', move: 'c', flaw: 'd' },
    stats: { hp: 8, atk: 8, def: 7, spd: 7 },
    moves: [],
    flaw: { name: 'Brittle', effect: 'glass' },
    sprite: { palette: [], rows: [] },
    wins: 1,
    losses: 2,
    created_at: '2026-01-01T00:00:00Z',
  }

  it('strips session_id and prompts', () => {
    const out = toPublicFighter(row) as Record<string, unknown>
    expect(out.session_id).toBeUndefined()
    expect(out.prompts).toBeUndefined()
  })

  it('keeps everything the UI renders', () => {
    const out = toPublicFighter(row) as Record<string, unknown>
    for (const key of ['id', 'name', 'title', 'stats', 'moves', 'flaw', 'sprite', 'wins', 'losses']) {
      expect(out[key]).toBeDefined()
    }
  })

  it('does not mutate the row it was given', () => {
    const copy = { ...row }
    toPublicFighter(copy)
    expect(copy.session_id).toBe('secret-session')
  })
})

describe('PUBLIC_FIGHTER_COLUMNS', () => {
  it('never selects the private columns', () => {
    const columns = PUBLIC_FIGHTER_COLUMNS.split(',').map((c) => c.trim())
    expect(columns).not.toContain('session_id')
    expect(columns).not.toContain('prompts')
    expect(columns).not.toContain('*')
  })
})
