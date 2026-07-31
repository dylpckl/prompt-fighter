import { SPIRIT_MAX, STAT_MAX } from '@/lib/engine/types'
import type { Fighter } from '@/lib/engine/types'
import { label, t } from '@/theme'

const BODY_ROWS = [
  ['hp', 'Vitality'],
  ['atk', 'Attack'],
  ['def', 'Defense'],
  ['spd', 'Speed'],
] as const

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
        <StatRow key={key} name={name} value={fighter.stats[key]} max={STAT_MAX} />
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
        <StatRow key={key} name={name} value={fighter.stats[key]} max={SPIRIT_MAX} />
      ))}

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <MoveRow tag="Basic" move={fighter.moves[0]} />
        <MoveRow tag="Signature" move={fighter.moves[1]} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ ...label, width: 66, flexShrink: 0, color: t.accent }}>Flaw</span>
          <span style={{ fontSize: 13 }}>{fighter.flaw.name}</span>
          <span style={{ fontSize: 11, color: t.faint, marginLeft: 'auto' }}>
            {fighter.flaw.effect}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Bars scale against their own budget's ceiling, so a 10 reads as maxed. */
function StatRow({ name, value, max }: { name: string; value: number; max: number }) {
  const filled = Number.isFinite(value) ? value : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...label, width: 66, flexShrink: 0 }}>{name}</span>
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
        {move.effect} · {move.power}
      </span>
    </div>
  )
}
