import { useEffect, useState } from 'react'
import type { Fighter } from '@/lib/engine/types'
import type { FightResult } from '@/lib/api'
import { VICTORY_LABELS, victoryText } from '@/lib/engine/victory'
import { FightStage, stageSide } from '@/components/FightStage'
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

/**
 * The solo replay. This screen owns its clock — it counts beats up on a
 * setTimeout and hands the number to the shared stage. Bracket mode renders the
 * same stage off the server clock instead; nothing about the picture differs.
 */
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

  const playerWon = winner === 'a'

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <FightStage
        a={stageSide(player)}
        b={stageSide(opponent)}
        log={log}
        maxHp={maxHp}
        step={step}
      />

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
