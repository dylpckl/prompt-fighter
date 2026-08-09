'use client'

import { normalizeRules } from '@/lib/engine/rules'
import { StatBlock } from '@/components/StatBlock'
import type { Fighter } from '@/lib/engine/types'
import { label, panel } from '@/theme'

/**
 * Layout check for the card, at the two widths CLAUDE.md pins.
 *
 * This used to render the old many-rules `StatBlock` — a wall of up to six
 * rules. That layout is moot: the card now shows four bars, both move names,
 * the flaw, and at most one Special (the fighter's `marquee` rule) — see
 * `cardModel`. What's still worth stress-testing is the same thing it always
 * was, worst-case text at 375px and at 1280px, just aimed at the new,
 * smaller surface.
 *
 * Both fixtures below are deliberately the worst case rather than typical
 * fighters: the longest name and flavour line the normalizer will let
 * through (`RULE_NAME_MAX` / `RULE_TEXT_MAX` in `lib/engine/rules.ts`), and
 * one unbroken 26-character word with no spaces in it, set as the `marquee`
 * so it lands as the Special's name — the case that silently widens a grid
 * track past the viewport if `overflowWrap` ever regresses.
 */
const CINDER_RULES = normalizeRules([
  {
    name: 'Unbrokenwordthatnevrwraps',
    text: 'Nothing about this is reasonable, and it keeps not being reasonable, one clause after another with nowhere natural to break.',
    when: { on: 'when_they_use', value: 0, effect: 'heavy' },
    then: { do: 'damage_taken_mult', value: 3 },
    chance: 65,
    times: 0,
    marquee: true,
  },
  {
    name: 'Skin of the Nine Hells',
    text: 'The blade snaps against him and he does not look up.',
    when: { on: 'when_i_am_hit', value: 0 },
    then: { do: 'immune', value: 0 },
    chance: 100,
    times: 0,
  },
])

const RIVAL_RULES = normalizeRules([
  {
    name: 'The Long Complaint',
    text: 'She starts listing his failings one by one, pitched exactly for the back row, and the room begins to agree with her before he gets a word in.',
    when: { on: 'my_turn', value: 0 },
    then: { do: 'pressure_add', value: 9, track: 'crowd' },
    chance: 100,
    times: 0,
    marquee: true,
  },
  {
    name: 'Opening Statement',
    text: 'She is already talking when the bell goes.',
    when: { on: 'fight_start', value: 0 },
    then: { do: 'boost_atk', value: 3 },
    chance: 100,
    times: 1,
  },
])

function fixture(
  id: string,
  name: string,
  title: string,
  rules: Fighter['rules'],
  stats: Fighter['stats'],
): Fighter {
  return {
    id,
    name,
    title,
    stats,
    moves: [
      { name: 'Backhand', power: 5, effect: 'damage' },
      { name: 'The Long Goodnight', power: 10, effect: 'heavy' },
    ],
    flaw: { name: 'Sentimental', effect: 'slow_start' },
    rules,
    sprite: { palette: Array(8).fill('#000000'), rows: Array(16).fill('0'.repeat(16)) },
    wins: 3,
    losses: 1,
    favorites: 2,
  }
}

const CINDER = fixture('cinder', 'Brother Cinder', 'The Ash-Sworn, Unbothered', CINDER_RULES, {
  hp: 12,
  atk: 9,
  def: 3,
  spd: 6,
  cha: 2,
  wil: 10,
  arc: 6,
  luk: 2,
})

const RIVAL = fixture('rival', 'Marguerite Vance', 'Of Counsel', RIVAL_RULES, {
  hp: 7,
  atk: 8,
  def: 8,
  spd: 7,
  cha: 10,
  wil: 4,
  arc: 3,
  luk: 3,
})

export default function RulesPreviewPage() {
  return (
    <div className="shell--wide shell">
      <p style={{ ...label, margin: '0 0 8px' }}>Card, worst case</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {/* minWidth: 0 on every grid child holding text — CLAUDE.md: grid
            children default to min-width: auto, and a long word or an
            un-wrapped label silently pushes a track wider than the viewport. */}
        <div style={{ ...panel, padding: 14, minWidth: 0 }}>
          <StatBlock fighter={CINDER} />
        </div>
        <div style={{ ...panel, padding: 14, minWidth: 0 }}>
          <StatBlock fighter={RIVAL} />
        </div>
      </div>
    </div>
  )
}
