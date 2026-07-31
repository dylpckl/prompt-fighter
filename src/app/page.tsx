'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Fighter, FighterPrompts } from '@/lib/engine/types'
import { createFighter, fetchFighter, requestFight, type FightResult } from '@/lib/api'
import { getSessionId, getStoredFighterId, setStoredFighterId } from '@/lib/session'
import { Builder } from '@/screens/Builder'
import { Reveal } from '@/screens/Reveal'
import { Arena } from '@/screens/Arena'
import { label } from '@/theme'

type Screen = 'loading' | 'build' | 'reveal' | 'arena'

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Returning player: pick their fighter back up. localStorage is only
  // available after mount, so this can't run during render.
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

  const handleCreate = useCallback(async (prompts: FighterPrompts) => {
    setBusy(true)
    setError(null)
    try {
      const { fighter: made } = await createFighter(getSessionId(), prompts)
      setStoredFighterId(made.id)
      setFighter(made)
      setResult(null)
      setScreen('reveal')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const handleFight = useCallback(async () => {
    if (!fighter) return
    setBusy(true)
    setError(null)
    try {
      const fight = await requestFight(getSessionId(), fighter.id)
      setResult(fight)
      // The record moved server-side; mirror it so the reveal screen agrees.
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
  }, [fighter])

  const handleRebuild = useCallback(() => {
    setStoredFighterId(null)
    setFighter(null)
    setResult(null)
    setError(null)
    setScreen('build')
  }, [])

  return (
    <>
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
    </>
  )
}
