import type { Fighter } from '@/lib/engine/types'
import { cardModel } from '@/lib/engine/card'
import { FLAW_HELP, RULES_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { label, t } from '@/theme'

export function StatBlock({ fighter }: { fighter: Fighter }) {
  const { bars, moveNames, flawName, special } = cardModel(fighter)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {bars.map((bar) => (
        <FaceRow key={bar.key} name={bar.label} value={bar.value} max={bar.max} />
      ))}

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <NameRow tag="Basic" name={moveNames[0]} />
        <NameRow tag="Signature" name={moveNames[1]} />
        <NameRow tag="Flaw" name={flawName} help={FLAW_HELP[fighter.flaw.effect]} accent />
      </div>

      {special && (
        <div style={{ display: 'grid', gap: 2, marginTop: 4, minWidth: 0,
          borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
          <span style={{ ...label, fontSize: 10, color: t.faint }}>
            <Hint text={RULES_HELP}>Special</Hint>
          </span>
          <span style={{ fontSize: 13, color: t.accent, overflowWrap: 'anywhere' }}>{special.name}</span>
          <span style={{ fontSize: 11, color: t.dim, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{special.text}</span>
        </div>
      )}
    </div>
  )
}

function FaceRow({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...label, width: 82, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, minWidth: 0, height: 8, background: t.panelHi, border: `1px solid ${t.line}`, padding: 1 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: t.text }} />
      </div>
    </div>
  )
}

function NameRow({ tag, name, help, accent }: { tag: string; name: string; help?: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ ...label, width: 82, flexShrink: 0, color: accent ? t.accent : undefined }}>{tag}</span>
      <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{help ? <Hint text={help}>{name}</Hint> : name}</span>
    </div>
  )
}
