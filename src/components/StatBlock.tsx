import { SPIRIT_MAX, STAT_MAX } from '@/lib/engine/types'
import type { Fighter, Stats } from '@/lib/engine/types'
import { describeRule } from '@/lib/engine/rules'
import type { Rule } from '@/lib/engine/rules'
import { FLAW_HELP, MOVE_HELP, RULES_HELP, STAT_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { label, t } from '@/theme'

const BODY_ROWS = [
  ['hp', 'Vitality'],
  ['atk', 'Attack'],
  ['def', 'Defense'],
  ['spd', 'Speed'],
] as const satisfies ReadonlyArray<readonly [keyof Stats, string]>

const SPIRIT_ROWS = [
  ['cha', 'Presence'],
  ['wil', 'Resolve'],
  ['arc', 'Weirdness'],
  ['luk', 'Fate'],
] as const

export function StatBlock({ fighter }: { fighter: Fighter }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {BODY_ROWS.map(([key, name]) => (
        <StatRow key={key} name={name} help={STAT_HELP[key]} value={fighter.stats[key]} max={STAT_MAX} />
      ))}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          borderTop: `1px solid ${t.line}`,
          paddingTop: 8,
        }}
      >
        <span style={{ ...label, fontSize: 10, color: t.faint }}>Spirit</span>
      </div>

      {SPIRIT_ROWS.map(([key, name]) => (
        <StatRow
          key={key}
          name={name}
          help={STAT_HELP[key]}
          value={fighter.stats[key]}
          max={SPIRIT_MAX}
        />
      ))}

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <MoveRow tag="Basic" move={fighter.moves[0]} />
        <MoveRow tag="Signature" move={fighter.moves[1]} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ ...label, width: 66, flexShrink: 0, color: t.accent }}>Flaw</span>
          <span style={{ fontSize: 13 }}>{fighter.flaw.name}</span>
          <span style={{ fontSize: 11, color: t.faint, marginLeft: 'auto' }}>
            <Hint text={FLAW_HELP[fighter.flaw.effect]}>{fighter.flaw.effect}</Hint>
          </span>
        </div>
      </div>

      {fighter.rules?.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderTop: `1px solid ${t.line}`,
              paddingTop: 8,
            }}
          >
            <span style={{ ...label, fontSize: 10, color: t.faint }}>
              <Hint text={RULES_HELP}>Rules</Hint>
            </span>
          </div>

          {fighter.rules.map((rule, i) => (
            <RuleRow key={`${rule.name}-${i}`} rule={rule} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Stacked rather than the label-and-value row the stats use. A rule's
 * description is a whole sentence and its name is up to 28 characters, so a
 * two-column layout either wraps into a ragged mess at 375px or — worse, since
 * these sit in a grid — pushes its track wider than the viewport. `minWidth: 0`
 * and `overflowWrap` are the belt and braces for a name with no spaces in it.
 */
function RuleRow({ rule }: { rule: Rule }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 13, color: t.accent, overflowWrap: 'anywhere' }}>{rule.name}</span>
      <span style={{ fontSize: 11, color: t.dim, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
        {describeRule(rule)}
      </span>
    </div>
  )
}

/** Bars scale against their own budget's ceiling, so a 10 reads as maxed. */
function StatRow({
  name,
  help,
  value,
  max,
}: {
  name: string
  help: string
  value: number
  max: number
}) {
  const filled = Number.isFinite(value) ? value : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...label, width: 66, flexShrink: 0 }}>
        <Hint text={help}>{name}</Hint>
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          background: t.panelHi,
          border: `1px solid ${t.line}`,
          display: 'flex',
          gap: 1,
          padding: 1,
        }}
      >
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: i < filled ? t.text : 'transparent',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 12, color: t.dim, width: 18, textAlign: 'right' }}>{filled}</span>
    </div>
  )
}

function MoveRow({ tag, move }: { tag: string; move: Fighter['moves'][number] }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span style={{ ...label, width: 66, flexShrink: 0 }}>{tag}</span>
      <span style={{ fontSize: 13 }}>{move.name}</span>
      <span style={{ fontSize: 11, color: t.faint, marginLeft: 'auto' }}>
        <Hint text={MOVE_HELP[move.effect]}>
          {move.effect} · {move.power}
        </Hint>
      </span>
    </div>
  )
}
