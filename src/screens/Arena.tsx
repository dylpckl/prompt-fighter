import { useEffect, useMemo, useState } from 'react'
import type { Fighter, Side } from '@/lib/engine/types'
import type { FightResult } from '@/lib/api'
import { VICTORY_LABELS, victoryText } from '@/lib/engine/victory'
import { Sprite } from '@/components/Sprite'
import { button, label, panel, t } from '@/theme'

const FIRST_BEAT_MS = 550
const BEAT_MS = 1050

interface Props {
  player: Fighter
  result: FightResult
  onAgain: () => void
  onRebuild: () => void
  busy: boolean
  error: string | null
}

export function Arena({ player, result, onAgain, onRebuild, busy, error }: Props) {
  const { log, opponent, maxHp, winner, victory } = result
  const [step, setStep] = useState(0)

  // A fresh result means a fresh replay.
  useEffect(() => setStep(0), [result])

  const finished = step >= log.length

  useEffect(() => {
    if (finished) return
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? FIRST_BEAT_MS : BEAT_MS)
    return () => clearTimeout(id)
  }, [step, finished])

  const current = step > 0 ? log[step - 1] : null
  const hp = current ? current.hp : { a: maxHp.a, b: maxHp.b }

  const hitKeys = useMemo(() => {
    if (!current || current.damage <= 0) return { a: 0, b: 0 }
    return current.actor === 'a' ? { a: 0, b: step } : { a: step, b: 0 }
  }, [current, step])

  const playerWon = winner === 'a'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...panel, padding: 16, display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <HealthBar fighter={player} hp={hp.a} max={maxHp.a} side="a" />
          <HealthBar fighter={opponent} hp={hp.b} max={maxHp.b} side="b" />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            minHeight: 128,
            padding: '0 4px',
          }}
        >
          <Sprite sprite={player.sprite} scale={7} hitKey={hitKeys.a} idle={!finished} />
          <Sprite sprite={opponent.sprite} scale={7} flip hitKey={hitKeys.b} idle={!finished} />
        </div>
      </div>

      <div
        style={{
          ...panel,
          padding: 14,
          minHeight: 92,
          display: 'grid',
          gap: 8,
          alignContent: 'start',
        }}
      >
        {current ? (
          <p key={step} style={{ margin: 0, fontSize: 14, lineHeight: 1.5, animation: 'fadeUp 200ms ease-out' }}>
            {current.text}
          </p>
        ) : (
          <p style={{ ...label, margin: 0 }}>Fight</p>
        )}

        {step > 1 && (
          <p style={{ margin: 0, fontSize: 12, color: t.faint, lineHeight: 1.5 }}>
            {log[step - 2].text}
          </p>
        )}
      </div>

      {!finished ? (
        <button onClick={() => setStep(log.length)} style={button('ghost')}>
          Skip to result
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 12, animation: 'fadeUp 260ms ease-out' }}>
          <div
            style={{
              ...panel,
              padding: 16,
              textAlign: 'center',
              borderColor: playerWon ? t.good : t.accent,
            }}
          >
            <p style={{ ...label, margin: 0, color: playerWon ? t.good : t.accent }}>
              {playerWon ? 'Victory' : 'Defeat'} — {VICTORY_LABELS[victory]}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5 }}>
              {victoryText(
                victory,
                playerWon ? player.name : opponent.name,
                playerWon ? opponent.name : player.name,
              )}
            </p>
          </div>

          {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

          <button onClick={onAgain} disabled={busy} style={button()}>
            {busy ? 'Finding opponent…' : 'Fight again'}
          </button>
          <button onClick={onRebuild} disabled={busy} style={button('ghost')}>
            Build someone new
          </button>
        </div>
      )}
    </div>
  )
}

function HealthBar({
  fighter,
  hp,
  max,
  side,
}: {
  fighter: Fighter
  hp: number
  max: number
  side: Side
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  const low = pct <= 30
  const alignRight = side === 'b'

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: alignRight ? 'end' : 'start' }}>
      <span
        style={{
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {fighter.name}
      </span>
      <div
        style={{
          width: '100%',
          height: 10,
          background: t.panelHi,
          border: `1px solid ${t.line}`,
          padding: 1,
          display: 'flex',
          justifyContent: alignRight ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: low ? t.accent : t.good,
            transition: 'width 380ms cubic-bezier(0.2, 0.8, 0.3, 1), background 220ms ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: t.faint }}>
        {hp} / {max}
      </span>
    </div>
  )
}
