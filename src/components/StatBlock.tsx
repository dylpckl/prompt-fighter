import { STAT_MAX } from '@/lib/engine/types'
import type { Fighter, Stats } from '@/lib/engine/types'
import { FLAW_HELP, MOVE_HELP, STAT_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { label, t } from '@/theme'

const ROWS = [
  ['hp', 'Vitality'],
  ['atk', 'Attack'],
  ['def', 'Defense'],
  ['spd', 'Speed'],
] as const satisfies ReadonlyArray<readonly [keyof Stats, string]>

export function StatBlock({ fighter }: { fighter: Fighter }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {ROWS.map(([key, name]) => {
        const value = fighter.stats[key]
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...label, width: 66, flexShrink: 0 }}>
              <Hint text={STAT_HELP[key]}>{name}</Hint>
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
              {Array.from({ length: STAT_MAX }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    background: i < value ? t.text : 'transparent',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 12, color: t.dim, width: 18, textAlign: 'right' }}>{value}</span>
          </div>
        )
      })}

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
