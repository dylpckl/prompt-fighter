import type { Candidate } from '@/lib/engine/types'
import type { Special } from '@/lib/engine/specials'
import { faceBars } from '@/lib/engine/face'
import { Sprite } from '@/components/Sprite'
import { label, panel, t } from '@/theme'

interface Props {
  candidate: Candidate
  specials: Special[]
  /** Index into `specials`. */
  onPick: (index: number) => void
  busy: boolean
  error: string | null
}

/**
 * The one creation choice: three honest reads of the prompt's standout idea,
 * shown as text alone (no numbers — see `faceBars`/`cardModel`) so the pick
 * has to be read off what each one says it does, not off a bigger stat.
 */
export function Choose({ candidate, specials, onPick, busy, error }: Props) {
  const bars = faceBars(candidate.stats)

  return (
    <div style={{ display: 'grid', gap: 20, animation: 'fadeUp 260ms ease-out' }}>
      <div style={{ ...panel, padding: 20, display: 'grid', gap: 16, justifyItems: 'center' }}>
        <Sprite sprite={candidate.sprite} scale={9} />
        <div style={{ textAlign: 'center', display: 'grid', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{candidate.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: t.dim }}>{candidate.title}</p>
        </div>
      </div>

      <div style={{ ...panel, padding: 16, display: 'grid', gap: 8 }}>
        {bars.map((bar) => (
          <FaceRow key={bar.key} name={bar.label} value={bar.value} max={bar.max} />
        ))}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <p style={{ ...label, margin: 0 }}>Pick one power</p>
        <p style={{ margin: 0, fontSize: 12, color: t.faint, lineHeight: 1.5 }}>
          Three honest reads of the same idea. Whichever you pick is the one named on the card
          — the other two are gone for good.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {specials.map((special, i) => (
          <button
            key={`${special.name}-${i}`}
            onClick={() => onPick(i)}
            disabled={busy}
            style={{
              ...panel,
              display: 'grid',
              gap: 4,
              padding: 14,
              width: '100%',
              textAlign: 'left',
              background: t.panel,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ fontSize: 15, color: t.accent, overflowWrap: 'anywhere' }}>
              {special.name}
            </span>
            <span style={{ fontSize: 13, color: t.dim, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              {special.text}
            </span>
          </button>
        ))}
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {busy && (
        <p style={{ ...label, margin: 0, textAlign: 'center' }}>Locking it in…</p>
      )}
    </div>
  )
}

function FaceRow({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...label, width: 82, flexShrink: 0 }}>{name}</span>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: 8,
          background: t.panelHi,
          border: `1px solid ${t.line}`,
          padding: 1,
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: t.text }} />
      </div>
    </div>
  )
}
