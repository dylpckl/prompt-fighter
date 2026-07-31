import { useEffect, useState } from 'react'
import type { BracketMatch, RoomView } from '@/lib/api'
import { BEAT_MS } from '@/lib/engine/bracket'
import { VICTORY_LABELS, victoryText } from '@/lib/engine/victory'
import { FightStage, type StageSide } from '@/components/FightStage'
import { Sprite } from '@/components/Sprite'
import { Bracket } from '@/screens/Bracket'
import { label, panel, t } from '@/theme'

interface Props {
  view: RoomView
  /** serverNow - Date.now(), sampled once. Everything below is arithmetic. */
  offset: number
}

/**
 * The shared screen. Every viewer holds the same log and the same `starts_at`,
 * so `floor((serverNow - startsAt) / beat_ms)` puts all of them on the same
 * beat — including whoever opened the link forty seconds late, who drops
 * straight into the middle of the round rather than starting it over.
 */
export function Broadcast({ view, offset }: Props) {
  const { live, entrants, bracket, room } = view
  const byId = new Map(entrants.map((e) => [e.fighter_id, e]))

  const beatMs = view.beat_ms || BEAT_MS
  const startsAt = live ? Date.parse(live.starts_at) : 0
  const logLength = live?.result?.log.length ?? 0

  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!startsAt) {
      setStep(0)
      return
    }
    // Ticking faster than a beat only to notice the boundary sooner; setting
    // the same number back is a no-op re-render-wise, so this is cheap.
    const update = () => {
      const elapsed = Date.now() + offset - startsAt
      const beat = Math.floor(elapsed / beatMs)
      setStep(Math.max(0, Math.min(logLength, beat)))
    }
    update()
    const id = setInterval(update, 100)
    return () => clearInterval(id)
  }, [startsAt, logLength, beatMs, offset])

  const done = room.status === 'done'
  const champion = done ? (byId.get(view.champion_id ?? '') ?? null) : null

  const side = (id: string | null): StageSide => {
    const e = id ? byId.get(id) : null
    return {
      name: e?.name ?? 'Unknown',
      title: e?.title ?? '',
      sprite: e?.sprite ?? null,
    }
  }

  // Bundled rather than tested inline so the log and the match narrow together.
  const fight = live && !live.bye && live.result ? { match: live, result: live.result } : null
  const walkover = live && live.bye ? live : null
  const finished = fight ? step >= fight.result.log.length : false

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {done ? (
        champion ? (
          <ChampionCard name={champion.name} title={champion.title} sprite={champion.sprite} />
        ) : (
          <p style={{ ...label, margin: 0, textAlign: 'center' }}>Bracket complete</p>
        )
      ) : (
        <p style={{ ...label, margin: 0, textAlign: 'center' }}>
          {live ? roundLine(live.round, room.rounds, live.slot) : 'Between matches'}
        </p>
      )}

      {fight ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <FightStage
            a={side(fight.match.a_fighter)}
            b={side(fight.match.b_fighter)}
            log={fight.result.log}
            maxHp={fight.result.maxHp}
            step={step}
          />

          {finished && (
            <div className="arena__tail">
              <div
                style={{
                  ...panel,
                  padding: 16,
                  textAlign: 'center',
                  borderColor: t.good,
                  animation: 'fadeUp 260ms ease-out',
                }}
              >
                <p style={{ ...label, margin: 0, color: t.good }}>
                  {VICTORY_LABELS[fight.result.victory]}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5 }}>
                  {victoryText(
                    fight.result.victory,
                    side(
                      fight.result.winner === 'a' ? fight.match.a_fighter : fight.match.b_fighter,
                    ).name,
                    side(
                      fight.result.winner === 'a' ? fight.match.b_fighter : fight.match.a_fighter,
                    ).name,
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : done ? null : (
        <Interstitial
          heading={walkover ? 'Walkover' : 'Up next'}
          body={
            walkover
              ? `${side(walkover.a_fighter ?? walkover.b_fighter).name} advances unopposed.`
              : nextLine(bracket, (id) => byId.get(id)?.name ?? 'Unknown')
          }
        />
      )}

      <Bracket
        bracket={bracket}
        entrants={entrants}
        rounds={room.rounds}
        liveKey={live ? `${live.round}:${live.slot}` : null}
        championId={view.champion_id}
      />
    </div>
  )
}

function roundLine(round: number, rounds: number, slot: number): string {
  const fromEnd = rounds - round
  if (fromEnd === 0) return 'The final'
  if (fromEnd === 1) return `Semi-final ${slot + 1}`
  if (fromEnd === 2) return `Quarter-final ${slot + 1}`
  return `Round ${round} · match ${slot + 1}`
}

/**
 * The next pairing the server will claim. Deliberately read off the tree rather
 * than asked for: the poll already carries it, and nobody has to be told twice.
 */
function nextLine(bracket: BracketMatch[], nameOf: (id: string) => string): string {
  const next = [...bracket]
    .sort((x, y) => x.round - y.round || x.slot - y.slot)
    .find((m) => m.starts_at === null && (m.a_fighter !== null || m.b_fighter !== null))

  if (!next) return 'Waiting on the round below.'
  if (!next.a_fighter || !next.b_fighter) {
    const solo = nameOf((next.a_fighter ?? next.b_fighter) as string)
    // Only round one can be genuinely short-handed. Higher up, a missing side
    // just means the match feeding it hasn't finished yet.
    return next.round === 1 ? `${solo} advances unopposed.` : `${solo} awaits an opponent.`
  }
  return `${nameOf(next.a_fighter)} vs ${nameOf(next.b_fighter)}`
}

function Interstitial({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="arena__tail">
      <div
        style={{
          ...panel,
          padding: '28px 18px',
          textAlign: 'center',
          display: 'grid',
          gap: 10,
          animation: 'fadeUp 260ms ease-out',
        }}
      >
        <p style={{ ...label, margin: 0 }}>{heading}</p>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.4 }}>{body}</p>
      </div>
    </div>
  )
}

function ChampionCard({
  name,
  title,
  sprite,
}: {
  name: string
  title: string
  sprite: RoomView['entrants'][number]['sprite']
}) {
  return (
    <div className="arena__tail">
      <div
        style={{
          ...panel,
          borderColor: t.warn,
          padding: 20,
          display: 'grid',
          gap: 12,
          justifyItems: 'center',
          textAlign: 'center',
          animation: 'fadeUp 260ms ease-out',
        }}
      >
        <p style={{ ...label, margin: 0, color: t.warn }}>Champion</p>
        {sprite && <Sprite sprite={sprite} scale={8} />}
        <div style={{ display: 'grid', gap: 4 }}>
          <p style={{ margin: 0, fontSize: 20 }}>{name}</p>
          <p style={{ margin: 0, fontSize: 13, color: t.dim }}>{title}</p>
        </div>
      </div>
    </div>
  )
}
