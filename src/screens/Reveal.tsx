import type { Fighter } from '@/lib/engine/types'
import { Sprite } from '@/components/Sprite'
import { StatBlock } from '@/components/StatBlock'
import { button, label, panel, t } from '@/theme'

interface Props {
  fighter: Fighter
  onFight: () => void
  /** Bracket mode — a room full of people rather than one random opponent. */
  onRooms: () => void
  onRebuild: () => void
  busy: boolean
  error: string | null
}

export function Reveal({ fighter, onFight, onRooms, onRebuild, busy, error }: Props) {
  const fought = fighter.wins + fighter.losses

  return (
    <div style={{ display: 'grid', gap: 20, animation: 'fadeUp 260ms ease-out' }}>
      <div style={{ ...panel, padding: 20, display: 'grid', gap: 16, justifyItems: 'center' }}>
        <Sprite sprite={fighter.sprite} scale={9} />
        <div style={{ textAlign: 'center', display: 'grid', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{fighter.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: t.dim }}>{fighter.title}</p>
        </div>
        <p style={{ ...label, margin: 0 }}>
          {fought === 0 ? 'Untested' : `${fighter.wins}W · ${fighter.losses}L`}
        </p>
      </div>

      <div style={{ ...panel, padding: 16 }}>
        <StatBlock fighter={fighter} />
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      <div style={{ display: 'grid', gap: 10 }}>
        <button onClick={onFight} disabled={busy} style={button()}>
          {busy ? 'Finding opponent…' : 'Find opponent'}
        </button>
        <button onClick={onRooms} disabled={busy} style={button('ghost')}>
          Play with friends
        </button>
        <button onClick={onRebuild} disabled={busy} style={button('ghost')}>
          Build someone new
        </button>
      </div>
    </div>
  )
}
