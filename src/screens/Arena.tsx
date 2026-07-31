import { useEffect, useState } from 'react'
import type { Fighter } from '@/lib/engine/types'
import type { FightResult } from '@/lib/api'
import { VICTORY_LABELS, victoryText } from '@/lib/engine/victory'
import { FightStage, stageSide } from '@/components/FightStage'
import { VersusPreview } from '@/screens/VersusPreview'
import { button, label, panel, t } from '@/theme'

const FIRST_BEAT_MS = 550
const BEAT_MS = 1050
/** Long enough to read the table, short enough not to be a wait. */
const PREVIEW_MS = 4200

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
  /** The matchup gets a beat before the bell. Solo only — a bracket broadcast
   *  derives its beat from the server clock, so a local pause would desync it. */
  const [previewing, setPreviewing] = useState(true)

  // A fresh result means a fresh preview and a fresh replay.
  useEffect(() => {
    setStep(0)
    setPreviewing(true)
  }, [result])

  useEffect(() => {
    if (!previewing) return
    const id = setTimeout(() => setPreviewing(false), PREVIEW_MS)
    return () => clearTimeout(id)
  }, [previewing, result])

  const finished = step >= log.length

  useEffect(() => {
    if (previewing || finished) return
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? FIRST_BEAT_MS : BEAT_MS)
    return () => clearTimeout(id)
  }, [step, finished, previewing])

  const playerWon = winner === 'a'

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {previewing ? (
        <VersusPreview a={player} b={opponent} />
      ) : (
        <FightStage
          a={stageSide(player)}
          b={stageSide(opponent)}
          log={log}
          maxHp={maxHp}
          step={step}
        />
      )}

      <div className="arena__tail">
        <div className="arena__tail-inner">
        {previewing ? (
          <button onClick={() => setPreviewing(false)} style={button()}>
            Fight
          </button>
        ) : !finished ? (
          <button onClick={() => setStep(log.length)} style={button('ghost')}>
            Skip to result
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 10, animation: 'fadeUp 260ms ease-out' }}>
            <div
              style={{
                ...panel,
                padding: 12,
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

            <div className="arena__actions">
              <button onClick={onAgain} disabled={busy} style={button()}>
                {busy ? 'Finding…' : 'Fight again'}
              </button>
              <button onClick={onRebuild} disabled={busy} style={button('ghost')}>
                Build someone new
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
