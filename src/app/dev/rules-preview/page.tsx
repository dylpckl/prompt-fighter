'use client'

import { FightStage, stageSide } from '@/components/FightStage'
import { StatBlock } from '@/components/StatBlock'
import { normalizeRules } from '@/lib/engine/rules'
import { simulate } from '@/lib/engine/sim'
import type { Fighter } from '@/lib/engine/types'
import { label, panel } from '@/theme'

/**
 * Layout check for rules, at the two widths CLAUDE.md pins.
 *
 * Both fixtures are deliberately the worst case rather than typical fighters:
 * the cap of six rules, the longest name and sentence the normalizer will let
 * through, and one unbroken 26-character name with no spaces in it — that last
 * one is the case that silently widens a grid track past the viewport.
 *
 * The fight below is a real `simulate()` call, not a mocked log, so the beats
 * this renders are exactly the beats the arena would render.
 */
const CINDER_RULES = normalizeRules([
  {
    name: 'Skin of the Nine Hells',
    text: 'The blade snaps against him and he does not look up.',
    when: { on: 'when_i_am_hit', value: 0 },
    then: { do: 'immune', value: 0 },
    chance: 100,
    times: 0,
  },
  {
    name: 'Unbrokenwordthatnevrwraps',
    text: 'Nothing about this is reasonable, and it keeps not being reasonable.',
    when: { on: 'when_they_use', value: 0, effect: 'heavy' },
    then: { do: 'damage_taken_mult', value: 3 },
    chance: 65,
    times: 0,
  },
  {
    name: 'The Third Nap',
    text: 'He sits down mid-round. Nobody stops him.',
    when: { on: 'every_other_turn', value: 3 },
    then: { do: 'skip_my_turn', value: 0 },
    chance: 100,
    times: 0,
  },
  {
    name: 'Grandmother, Named Aloud',
    text: 'Someone says it out loud. The skin goes ordinary.',
    when: { on: 'their_hp_below', value: 40 },
    then: { do: 'silence_them', value: 0 },
    chance: 100,
    times: 1,
  },
  {
    name: 'Spite Compounding',
    text: 'Every miss makes the next one worse for everybody in the building.',
    when: { on: 'when_i_miss', value: 0 },
    then: { do: 'boost_atk', value: 4 },
    chance: 100,
    times: 0,
  },
  {
    name: 'One More, Then',
    text: 'He gets back up. He wants everyone to know this is the last time.',
    when: { on: 'when_i_would_fall', value: 0 },
    then: { do: 'revive', value: 45 },
    chance: 100,
    times: 1,
  },
])

const RIVAL_RULES = normalizeRules([
  {
    name: 'The Long Complaint',
    text: 'She starts listing his failings. The room begins to agree.',
    when: { on: 'my_turn', value: 0 },
    then: { do: 'pressure_add', value: 9, track: 'crowd' },
    chance: 100,
    times: 0,
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
  const result = simulate(CINDER, RIVAL, 20260806)

  return (
    <div className="shell--wide shell">
      <p style={{ ...label, margin: '0 0 8px' }}>Fighter sheet</p>
      <div style={{ ...panel, padding: 14, marginBottom: 20 }}>
        <StatBlock fighter={CINDER} />
      </div>

      <p style={{ ...label, margin: '0 0 8px' }}>Arena, every beat drawn</p>
      <FightStage
        a={stageSide(CINDER)}
        b={stageSide(RIVAL)}
        log={result.log}
        maxHp={result.maxHp}
        step={result.log.length}
      />
    </div>
  )
}
