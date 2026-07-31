import { useCallback, useEffect, useState } from 'react'
import type { Fighter, FighterPrompts } from './types.ts'
import { createFighter, fetchFighter, requestFight, type FightResult } from './lib/api.ts'
import { getSessionId, getStoredFighterId, setStoredFighterId } from './lib/session.ts'
import { Builder } from './screens/Builder.tsx'
import { Reveal } from './screens/Reveal.tsx'
import { Arena } from './screens/Arena.tsx'
import { label, t } from './theme.ts'

type Screen = 'loading' | 'build' | 'reveal' | 'arena'

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionId = getSessionId()

  // Returning player: pick their fighter back up.
  useEffect(() => {
    let cancelled = false
    const stored = getStoredFighterId()
    if (!stored) {
      setScreen('build')
      return
    }
    fetchFighter(stored)
      .then((found) => {
        if (cancelled) return
        if (found) {
          setFighter(found)
          setScreen('reveal')
        } else {
          setStoredFighterId(null)
          setScreen('build')
        }
      })
      .catch(() => {
        if (!cancelled) setScreen('build')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreate = useCallback(
    async (prompts: FighterPrompts) => {
      setBusy(true)
      setError(null)
      try {
        const { fighter: made } = await createFighter(sessionId, prompts)
        setStoredFighterId(made.id)
        setFighter(made)
        setResult(null)
        setScreen('reveal')
      } catch (err) {
        setError(message(err))
      } finally {
        setBusy(false)
      }
    },
    [sessionId],
  )

  const handleFight = useCallback(async () => {
    if (!fighter) return
    setBusy(true)
    setError(null)
    try {
      const fight = await requestFight(sessionId, fighter.id)
      setResult(fight)
      // The record moved; reflect it when we come back to the reveal screen.
      setFighter((f) =>
        f
          ? {
              ...f,
              wins: f.wins + (fight.winner === 'a' ? 1 : 0),
              losses: f.losses + (fight.winner === 'b' ? 1 : 0),
            }
          : f,
      )
      setScreen('arena')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }, [fighter, sessionId])

  const handleRebuild = useCallback(() => {
    setStoredFighterId(null)
    setFighter(null)
    setResult(null)
    setError(null)
    setScreen('build')
  }, [])

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        justifyContent: 'center',
        padding: '28px 18px 48px',
      }}
    >
      <main style={{ width: '100%', maxWidth: 440 }}>
        <p
          style={{
            ...label,
            margin: '0 0 22px',
            textAlign: 'center',
            color: t.faint,
          }}
        >
          prompt fight
        </p>

        {screen === 'loading' && <p style={{ ...label, textAlign: 'center' }}>Loading…</p>}

        {screen === 'build' && <Builder onSubmit={handleCreate} busy={busy} error={error} />}

        {screen === 'reveal' && fighter && (
          <Reveal
            fighter={fighter}
            onFight={handleFight}
            onRebuild={handleRebuild}
            busy={busy}
            error={error}
          />
        )}

        {screen === 'arena' && fighter && result && (
          <Arena
            player={fighter}
            result={result}
            onAgain={handleFight}
            onRebuild={handleRebuild}
            busy={busy}
            error={error}
          />
        )}
      </main>
    </div>
  )
}
