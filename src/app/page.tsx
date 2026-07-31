'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Fighter, FighterPrompts } from '@/lib/engine/types'
import { createFighter, fetchFighter, requestFight, type FightResult } from '@/lib/api'
import { getSessionId, getStoredFighterId, setStoredFighterId } from '@/lib/session'
import { getReturnRoom, setReturnRoom } from '@/components/roomReturn'
import { Builder } from '@/screens/Builder'
import { Reveal } from '@/screens/Reveal'
import { Arena } from '@/screens/Arena'
import { RoomEntry } from '@/screens/RoomEntry'
import { button, label, panel, t } from '@/theme'

type Screen = 'loading' | 'build' | 'reveal' | 'arena' | 'rooms'

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export default function Page() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('loading')
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** A room this visitor was sent away from to build a fighter first. */
  const [pendingRoom, setPendingRoom] = useState<string | null>(null)

  // Returning player: pick their fighter back up. localStorage is only
  // available after mount, so this can't run during render.
  useEffect(() => {
    let cancelled = false
    setPendingRoom(getReturnRoom())
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
        const { fighter: made } = await createFighter(getSessionId(), prompts)
        setStoredFighterId(made.id)
        setFighter(made)
        setResult(null)
        setScreen('reveal')
        // They only came here to get into a room. Hand them straight back.
        if (pendingRoom) {
          setReturnRoom(null)
          setPendingRoom(null)
          router.push(`/room/${pendingRoom}`)
        }
      } catch (err) {
        setError(message(err))
      } finally {
        setBusy(false)
      }
    },
    [pendingRoom, router],
  )

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

  const handleRooms = useCallback(() => {
    setError(null)
    setScreen('rooms')
  }, [])

  const handleReturnRoom = useCallback(() => {
    if (!pendingRoom) return
    setReturnRoom(null)
    router.push(`/room/${pendingRoom}`)
  }, [pendingRoom, router])

  return (
    <div className={screen === 'arena' ? 'shell shell--wide' : 'shell'}>
      {screen === 'loading' && <p style={{ ...label, textAlign: 'center' }}>Loading…</p>}

      {screen === 'build' && <Builder onSubmit={handleCreate} busy={busy} error={error} />}

      {/* Somebody followed a room link without a fighter, built one, and came
          back around. Don't make them find the link again. */}
      {screen === 'reveal' && pendingRoom && (
        <div
          style={{
            ...panel,
            padding: 14,
            marginBottom: 16,
            display: 'grid',
            gap: 10,
            borderColor: t.warn,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
            Room {pendingRoom} is still waiting for you.
          </p>
          <button onClick={handleReturnRoom} style={button()}>
            Back to room {pendingRoom}
          </button>
        </div>
      )}

      {screen === 'reveal' && fighter && (
        <Reveal
          fighter={fighter}
          onFight={handleFight}
          onRooms={handleRooms}
          onRebuild={handleRebuild}
          busy={busy}
          error={error}
        />
      )}

      {screen === 'rooms' && (
        <RoomEntry
          fighterId={fighter?.id ?? null}
          onBuild={handleRebuild}
          onBack={() => setScreen(fighter ? 'reveal' : 'build')}
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
    </div>
  )
}
