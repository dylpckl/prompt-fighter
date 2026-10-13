import type { Fighter } from '@/lib/engine/types'
import { Sprite } from '@/components/Sprite'
import { StatBlock } from '@/components/StatBlock'
import { Lives } from '@/components/Lives'
import { PromptSheet } from '@/components/PromptSheet'
import { ShareButton } from '@/components/ShareButton'
import { button, label, panel, t } from '@/theme'

interface Props {
  fighter: Fighter
  onFight: () => void
  /** Bracket mode — a room full of people rather than one random opponent. */
  onRooms: () => void
  onRebuild: () => void
  /** Spend the banked edit. Only offered when there is one. */
  onEdit: () => void
  busy: boolean
  error: string | null
}

export function Reveal({ fighter, onFight, onRooms, onRebuild, onEdit, busy, error }: Props) {
  const fought = fighter.wins + fighter.losses
  const dead = fighter.dead_at !== null

  return (
    <div style={{ display: 'grid', gap: 20, animation: 'fadeUp 260ms ease-out' }}>
      <div
        style={{
          ...panel,
          padding: 20,
          display: 'grid',
          gap: 16,
          justifyItems: 'center',
          borderColor: dead ? t.accent : t.line,
        }}
      >
        <div style={{ opacity: dead ? 0.35 : 1, filter: dead ? 'grayscale(1)' : undefined }}>
          <Sprite sprite={fighter.sprite} scale={9} idle={!dead} />
        </div>
        <div style={{ textAlign: 'center', display: 'grid', gap: 4, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, overflowWrap: 'anywhere' }}>{fighter.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: t.dim }}>
            {fighter.title}
            {fighter.version > 1 && <span style={{ color: t.faint }}> · v{fighter.version}</span>}
          </p>
        </div>
        {dead ? (
          <p style={{ ...label, margin: 0, color: t.accent }}>
            Dead · {fighter.wins}W · {fighter.losses}L
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Lives lost={fighter.lives_lost} />
            <p style={{ ...label, margin: 0 }}>
              {fought === 0 ? 'Untested' : `${fighter.rating} · ${fighter.wins}W · ${fighter.losses}L`}
            </p>
          </div>
        )}
      </div>

      <div style={{ ...panel, padding: 16 }}>
        <StatBlock fighter={fighter} />
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {dead ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: t.dim, lineHeight: 1.5, textAlign: 'center' }}>
            {fighter.name} lost three of its own fights and is out of the game.
          </p>
          {fighter.prompts && (
            <PromptSheet heading={`Obituary — what ${fighter.name} was made of`} prompts={fighter.prompts} />
          )}
          <button onClick={onRebuild} style={button()}>
            Build someone new
          </button>
          <ShareButton
            path={`/fighter/${fighter.id}`}
            text={`${fighter.name} is dead. This is what it was made of.`}
            labelText="Share the obituary"
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {fighter.edits_available > 0 && (
            <button
              onClick={onEdit}
              disabled={busy}
              style={{ ...button('ghost'), color: t.warn, borderColor: t.warn }}
            >
              Edit available — change one slot
            </button>
          )}
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
      )}
    </div>
  )
}
