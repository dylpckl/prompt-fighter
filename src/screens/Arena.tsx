import { useEffect, useMemo, useRef, useState } from 'react'
import type { Fighter, Side, TurnEvent } from '@/lib/engine/types'
import type { FightResult } from '@/lib/api'
import { VICTORY_LABELS, victoryText } from '@/lib/engine/victory'
import { Sprite } from '@/components/Sprite'
import { StatBlock } from '@/components/StatBlock'
import { button, label, panel, t } from '@/theme'

const FIRST_BEAT_MS = 550
const BEAT_MS = 1050

const FIELD_HEIGHT = 240
const GROUND_HEIGHT = 76

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
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="arena">
        <div className="arena__stat arena__stat--a">
          <FighterPanel fighter={player} />
        </div>

        <div className="arena__field" style={{ display: 'grid', gap: 10 }}>
          <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <HealthBar fighter={player} hp={hp.a} max={maxHp.a} side="a" />
              <HealthBar fighter={opponent} hp={hp.b} max={maxHp.b} side="b" />
            </div>

            <Battlefield
              player={player}
              opponent={opponent}
              hitKeys={hitKeys}
              idle={!finished}
            />
          </div>
        </div>

        <div className="arena__stat arena__stat--b">
          <FighterPanel fighter={opponent} />
        </div>
      </div>

      <BattleLog entries={log.slice(0, step)} />

      <div className="arena__tail">
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
    </div>
  )
}

/**
 * The sprites stand on the ground line rather than floating in a flex row. The
 * inner width is capped so they close on each other instead of drifting to the
 * far edges once the shell goes wide.
 */
function Battlefield({
  player,
  opponent,
  hitKeys,
  idle,
}: {
  player: Fighter
  opponent: Fighter
  hitKeys: Record<Side, number>
  idle: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: FIELD_HEIGHT,
        overflow: 'hidden',
        border: `1px solid ${t.line}`,
        borderRadius: 3,
        background: `linear-gradient(180deg, #0e0e11 0%, ${t.panel} 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND_HEIGHT,
          background: t.panelHi,
          borderTop: `1px solid ${t.line}`,
        }}
      />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: GROUND_HEIGHT }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <Sprite sprite={player.sprite} scale={7} hitKey={hitKeys.a} idle={idle} />
          <Sprite sprite={opponent.sprite} scale={7} flip hitKey={hitKeys.b} idle={idle} />
        </div>
      </div>
    </div>
  )
}

function FighterPanel({ fighter }: { fighter: Fighter }) {
  return (
    <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fighter.name}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: t.dim }}>{fighter.title}</p>
      </div>
      <StatBlock fighter={fighter} />
    </div>
  )
}

/**
 * Appends as the replay runs and sticks to the bottom, so the fight reads as a
 * transcript building up rather than one line replacing another.
 */
function BattleLog({ entries }: { entries: TurnEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div style={{ ...panel, padding: 14, display: 'grid', gap: 10 }}>
      <p style={{ ...label, margin: 0 }}>Battle log</p>

      <div
        ref={ref}
        style={{
          maxHeight: 200,
          overflowY: 'auto',
          display: 'grid',
          gap: 6,
          alignContent: 'start',
        }}
      >
        {entries.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: t.faint }}>Waiting for the bell.</p>
        ) : (
          entries.map((e, i) => {
            const last = i === entries.length - 1
            return (
              <div
                key={`${e.turn}-${i}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  animation: last ? 'fadeUp 200ms ease-out' : undefined,
                }}
              >
                <span style={{ fontSize: 11, color: t.faint, width: 22, flexShrink: 0 }}>
                  {e.turn}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: last ? t.text : t.dim,
                  }}
                >
                  {e.text}
                </span>
                {e.damage > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: e.actor === 'a' ? t.good : t.accent,
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    −{e.damage}
                  </span>
                )}
                {e.heal > 0 && (
                  <span
                    style={{ fontSize: 11, color: t.good, marginLeft: 'auto', flexShrink: 0 }}
                  >
                    +{e.heal}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
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
