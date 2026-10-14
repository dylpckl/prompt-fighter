import { describe, expect, it } from 'vitest'
import { buildEditPrompt } from '../src/lib/engine/generation'

describe('buildEditPrompt', () => {
  const previous = {
    name: 'Chip Vandergriff',
    title: 'the Rolling Boil',
    version: 1,
    sprite: { palette: ['#000000', '#111111'], rows: ['0'.repeat(16), '1'.repeat(16)] },
  }
  const prompts = { body: 'a deep fryer', weapon: 'a ladle', move: 'oil splash', flaw: 'unplugs' }

  it('marks only the changed slot', () => {
    const out = buildEditPrompt(previous, prompts, 'weapon')
    expect(out).toContain('WEAPON (CHANGED): a ladle')
    expect(out.match(/\(CHANGED\)/g)).toHaveLength(1)
  })

  it('carries the name, the next version, and the old sprite', () => {
    const out = buildEditPrompt(previous, prompts, 'flaw')
    expect(out).toContain('Chip Vandergriff')
    expect(out).toContain('version 2')
    expect(out).toContain('1'.repeat(16))
  })
})

describe('PROMPT_SLOT_LABELS', () => {
  it('labels every prompt slot, in order', async () => {
    const { PROMPT_SLOTS, PROMPT_SLOT_LABELS } = await import('../src/lib/engine/types')
    expect(PROMPT_SLOT_LABELS.map((s) => s.key)).toEqual([...PROMPT_SLOTS])
  })
})
