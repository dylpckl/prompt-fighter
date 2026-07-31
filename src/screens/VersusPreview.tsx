import { SPIRIT_MAX, STAT_MAX } from '@/lib/engine/types'
import type { Fighter, Stats } from '@/lib/engine/types'
import { FLAW_HELP, MOVE_HELP, STAT_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { Sprite } from '@/components/Sprite'
import { label, panel, t } from '@/theme'

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
] as const satisfies ReadonlyArray<readonly [keyof Stats, string]>

/**
 * The beat before the bell. One table, read across: your number, the stat, then
 * theirs — so an advantage is visible without holding two stat blocks in your
 * head. Whoever is ahead on a line is the one lit up.
 */
export function VersusPreview({ a, b }: { a: Fighter; b: Fighter }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...panel, padding: 14, display: 'grid', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Corner fighter={a} />
          <span style={{ ...label, color: t.faint, paddingBottom: 18, flexShrink: 0 }}>vs</span>
          <Corner fighter={b} align="right" />
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          {BODY_ROWS.map(([key, name]) => (
            <CompareRow
              key={key}
              name={name}
              help={STAT_HELP[key]}
              left={a.stats[key]}
              right={b.stats[key]}
              max={STAT_MAX}
            />
          ))}

          <div style={{ borderTop: `1px solid ${t.line}`, marginTop: 3, paddingTop: 6 }}>
            <p style={{ ...label, margin: 0, fontSize: 9, color: t.faint, textAlign: 'center' }}>
              Spirit
            </p>
          </div>

          {SPIRIT_ROWS.map(([key, name]) => (
            <CompareRow
              key={key}
              name={name}
              help={STAT_HELP[key]}
              left={a.stats[key]}
              right={b.stats[key]}
              max={SPIRIT_MAX}
            />
          ))}
        </div>
      </div>

      <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
        <AbilityRow
          tag="Basic"
          left={a.moves[0].name}
          right={b.moves[0].name}
          leftHelp={MOVE_HELP[a.moves[0].effect]}
          rightHelp={MOVE_HELP[b.moves[0].effect]}
        />
        <AbilityRow
          tag="Signature"
          left={a.moves[1].name}
          right={b.moves[1].name}
          leftHelp={MOVE_HELP[a.moves[1].effect]}
          rightHelp={MOVE_HELP[b.moves[1].effect]}
        />
        <AbilityRow
          tag="Flaw"
          accent
          left={a.flaw.name}
          right={b.flaw.name}
          leftHelp={FLAW_HELP[a.flaw.effect]}
          rightHelp={FLAW_HELP[b.flaw.effect]}
        />
      </div>
    </div>
  )
}

function Corner({ fighter, align = 'left' }: { fighter: Fighter; align?: 'left' | 'right' }) {
  const right = align === 'right'
  return (
    <span style={{ display: 'grid', gap: 6, justifyItems: right ? 'end' : 'start', minWidth: 0 }}>
      <Sprite sprite={fighter.sprite} scale={4} flip={right} idle={false} />
      <span
        style={{
          fontSize: 13,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: right ? 'right' : 'left',
        }}
      >
        {fighter.name}
      </span>
      <span
        style={{
          fontSize: 11,
          color: t.dim,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {fighter.wins}W · {fighter.losses}L
      </span>
    </span>
  )
}

/** Bars grow inward from each side, so the longer one is the one ahead. */
function CompareRow({
  name,
  help,
  left,
  right,
  max,
}: {
  name: string
  help: string
  left: number
  right: number
  max: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          width: 18,
          textAlign: 'right',
          flexShrink: 0,
          color: left > right ? t.text : t.faint,
        }}
      >
        {left}
      </span>
      <Bar value={left} max={max} lead={left > right} align="right" />

      <span
        style={{ ...label, fontSize: 9, width: 64, textAlign: 'center', flexShrink: 0 }}
      >
        <Hint text={help}>{name}</Hint>
      </span>

      <Bar value={right} max={max} lead={right > left} align="left" />
      <span
        style={{
          fontSize: 12,
          width: 18,
          flexShrink: 0,
          color: right > left ? t.text : t.faint,
        }}
      >
        {right}
      </span>
    </div>
  )
}

function Bar({
  value,
  max,
  lead,
  align,
}: {
  value: number
  max: number
  lead: boolean
  align: 'left' | 'right'
}) {
  return (
    <div
      style={{
        flex: 1,
        height: 6,
        minWidth: 0,
        background: t.panelHi,
        border: `1px solid ${t.line}`,
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
          height: '100%',
          background: lead ? t.text : t.faint,
        }}
      />
    </div>
  )
}

function AbilityRow({
  tag,
  left,
  right,
  leftHelp,
  rightHelp,
  accent,
}: {
  tag: string
  left: string
  right: string
  leftHelp: string
  rightHelp: string
  accent?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <p
        style={{
          ...label,
          margin: 0,
          fontSize: 9,
          textAlign: 'center',
          color: accent ? t.accent : t.faint,
        }}
      >
        {tag}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 13, flex: 1, minWidth: 0, lineHeight: 1.35 }}>
          <Hint text={leftHelp}>{left}</Hint>
        </span>
        <span
          style={{ fontSize: 13, flex: 1, minWidth: 0, textAlign: 'right', lineHeight: 1.35 }}
        >
          <Hint text={rightHelp}>{right}</Hint>
        </span>
      </div>
    </div>
  )
}
