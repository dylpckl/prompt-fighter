import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { fetchRoom, joinRoom, startRoom, type RoomView } from '@/lib/api'
import { POLL_MS } from '@/lib/engine/bracket'
import { getSessionId, getStoredFighterId } from '@/lib/session'
import { setReturnRoom } from '@/components/roomReturn'
import { Lobby } from '@/screens/Lobby'
import { Broadcast } from '@/screens/Broadcast'
import { button, label, panel, t } from '@/theme'

interface Props {
  code: string
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

/**
 * Everything stateful about a room lives here: one poll loop, one clock offset,
 * one auto-join. The screens below it are given finished data and a callback.
 *
 * The offset is what keeps every viewer on the same beat, so it is measured
 * rather than guessed. `server_now` is stamped while the response is being
 * built, and comparing it to a local clock read taken after the response has
 * landed understates server time by roughly the round trip — which is fine at
 * 60ms and very much not fine for whoever triggered the cold start and waited
 * two seconds. So each poll is timed, half the round trip is added back, and a
 * sample is only *adopted* if it round-tripped faster than every sample before
 * it. That fixes the cold-start bias and picks up a mid-tournament NTP
 * correction, without re-jittering the replay a few tens of milliseconds back
 * and forth on every ordinary poll.
 */
export function Room({ code }: Props) {
  const router = useRouter()

  const [identity, setIdentity] = useState<{ sessionId: string; fighterId: string | null } | null>(
    null,
  )
  const [view, setView] = useState<RoomView | null>(null)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  /** Round trip of the best offset sample so far. Anything slower is ignored. */
  const bestTrip = useRef(Infinity)
  const joinAttempted = useRef(false)

  // localStorage is browser-only, so identity can't be read during render.
  useEffect(() => {
    setIdentity({ sessionId: getSessionId(), fighterId: getStoredFighterId() })
  }, [])

  // A self-rescheduling timeout rather than setInterval: a slow response must
  // not let requests pile up on a phone that just came back from sleep.
  useEffect(() => {
    if (!identity) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      try {
        const sentAt = Date.now()
        const next = await fetchRoom(code, identity.sessionId)
        if (cancelled) return

        const landedAt = Date.now()
        const trip = landedAt - sentAt
        if (trip <= bestTrip.current) {
          bestTrip.current = trip
          // `server_now` was stamped roughly mid-flight, so credit it half.
          setOffset(Date.parse(next.server_now) + trip / 2 - landedAt)
        }
        setView(next)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(message(err))
      }
      if (!cancelled) timer = setTimeout(run, POLL_MS)
    }

    run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [code, identity])

  // Following a link is the join. One attempt only — a full room or a started
  // room is a 409, and retrying it every poll would be noise.
  useEffect(() => {
    if (!view || !identity?.fighterId) return
    if (view.room.status !== 'lobby') return
    if (view.entrants.some((e) => e.is_you)) return
    if (joinAttempted.current) return

    joinAttempted.current = true
    joinRoom(code, identity.sessionId, identity.fighterId).catch((err: unknown) =>
      setNotice(message(err)),
    )
  }, [view, identity, code])

  const start = useCallback(async () => {
    if (!identity) return
    setStarting(true)
    setNotice(null)
    try {
      await startRoom(code, identity.sessionId)
    } catch (err) {
      setNotice(message(err))
    } finally {
      setStarting(false)
    }
  }, [code, identity])

  // No fighter on this device: park the code so the builder can hand them back.
  const goBuild = useCallback(() => {
    setReturnRoom(code)
    router.push('/')
  }, [code, router])

  if (!view) {
    return (
      <div className="shell" style={{ display: 'grid', gap: 14 }}>
        {error ? (
          <div style={{ ...panel, padding: 20, display: 'grid', gap: 14, textAlign: 'center' }}>
            <p style={{ ...label, margin: 0, color: t.accent }}>Room {code}</p>
            <p style={{ margin: 0, fontSize: 14, color: t.dim, lineHeight: 1.5 }}>{error}</p>
            <button onClick={() => router.push('/room')} style={button()}>
              Try another code
            </button>
          </div>
        ) : (
          <p style={{ ...label, margin: 0, textAlign: 'center' }}>Finding room {code}…</p>
        )}
      </div>
    )
  }

  const lobby = view.room.status === 'lobby'

  return (
    <div className={lobby ? 'shell' : 'shell shell--wide'} style={{ display: 'grid', gap: 14 }}>
      {lobby ? (
        <Lobby
          code={view.room.code}
          size={view.room.size}
          entrants={view.entrants}
          isHost={view.room.is_host}
          onStart={start}
          starting={starting}
          error={notice}
          onBuildFighter={identity && !identity.fighterId ? goBuild : null}
        />
      ) : (
        <>
          <Broadcast view={view} offset={offset} />
          {notice && (
            <p style={{ margin: 0, fontSize: 13, color: t.accent, textAlign: 'center' }}>
              {notice}
            </p>
          )}
        </>
      )}

      {/* A dropped poll shouldn't blank the room — keep showing the last state
          and say so quietly. */}
      {error && (
        <p style={{ ...label, margin: 0, textAlign: 'center', color: t.faint }}>
          Reconnecting…
        </p>
      )}

      <div className="arena__tail">
        <button onClick={() => router.push('/')} style={button('ghost')}>
          {view.room.status === 'done' ? 'Back to the arena' : 'Leave the room'}
        </button>
      </div>
    </div>
  )
}
