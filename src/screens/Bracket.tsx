import type { BracketMatch, RoomEntrant } from '@/lib/api'
import { VICTORY_LABELS } from '@/lib/engine/victory'
import { label, panel, t } from '@/theme'

interface Props {
  bracket: BracketMatch[]
  entrants: RoomEntrant[]
  /** Round `rounds` is the final. 0 while the room is still a lobby. */
  rounds: number
  /** `${round}:${slot}` of whatever is on screen right now, if anything. */
  liveKey: string | null
  championId: string | null
}

/**
 * The tree, as columns of cards inside one horizontal scroller.
 *
 * Sixteen entrants is four columns, which will not fit a phone at a readable
 * type size no matter how it's arranged — so the columns keep their width and
 * the container scrolls, rather than the names shrinking into nothing. Each
 * column spaces its matches out over the full height, which lines a round up
 * roughly between the two matches that feed it without any connector drawing.
 */
export function Bracket({ bracket, entrants, rounds, liveKey, championId }: Props) {
  const names = new Map(entrants.map((e) => [e.fighter_id, e.name]))
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Unknown') : null)

  const roundNumbers = Array.from({ length: rounds }, (_, i) => i + 1)

  if (roundNumbers.length === 0) {
    return null
  }

  return (
    <div style={{ ...panel, padding: 12, display: 'grid', gap: 10 }}>
      <p style={{ ...label, margin: 0 }}>Bracket</p>

      <div className="bracket">
        {roundNumbers.map((round) => (
          <div key={round} className="bracket__round">
            <p style={{ ...label, margin: 0, fontSize: 9, color: t.faint }}>
              {roundName(round, rounds)}
            </p>

            <div className="bracket__matches">
              {bracket
                .filter((m) => m.round === round)
                .sort((x, y) => x.slot - y.slot)
                .map((m) => (
                  <MatchCard
                    key={m.slot}
                    match={m}
                    nameOf={nameOf}
                    live={liveKey === `${m.round}:${m.slot}`}
                    championId={championId}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semis'
  if (fromEnd === 2) return 'Quarters'
  return `Round ${round}`
}

function MatchCard({
  match,
  nameOf,
  live,
  championId,
}: {
  match: BracketMatch
  nameOf: (id: string | null) => string | null
  live: boolean
  championId: string | null
}) {
  const a = nameOf(match.a_fighter)
  const b = nameOf(match.b_fighter)
  const pending = !match.a_fighter && !match.b_fighter
  const wonIt = match.winner === championId && championId !== null
  // `bye` is one-sidedness, which is also what a later match looks like while
  // the round below is still running. Only an already-claimed match can be
  // reported as a walkover; before that an empty side is simply unknown.
  const settled = match.starts_at !== null
  // The server writes `winner` in the same UPDATE as `starts_at` — the whole
  // match is simulated the instant it begins — so the winner of the match on
  // screen right now is already in the payload while the replay is on beat one.
  // Nothing about the live match may be read from it. Same gate as the victory
  // label below, which is fed from the same row written at the same moment.
  const reveal = !live && match.winner !== null

  return (
    <div
      style={{
        border: `1px solid ${live ? t.accent : wonIt ? t.warn : t.line}`,
        borderRadius: 3,
        background: live ? t.panelHi : 'transparent',
        padding: 8,
        display: 'grid',
        gap: 4,
        minWidth: 0,
      }}
    >
      <Row
        name={a}
        isWinner={reveal && match.winner === match.a_fighter}
        bye={settled && match.bye && match.a_fighter === null}
        pending={pending}
      />
      <Row
        name={b}
        isWinner={reveal && match.winner === match.b_fighter}
        bye={settled && match.bye && match.b_fighter === null}
        pending={pending}
      />

      {live && (
        <span style={{ ...label, fontSize: 9, color: t.accent }}>
          {match.bye ? 'Advancing' : 'Live now'}
        </span>
      )}

      {!live && match.victory && (
        <span
          style={{
            ...label,
            fontSize: 9,
            color: t.faint,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {VICTORY_LABELS[match.victory]}
        </span>
      )}

      {!live && !match.victory && settled && match.bye && match.winner && (
        <span style={{ ...label, fontSize: 9, color: t.faint }}>Bye</span>
      )}
    </div>
  )
}

function Row({
  name,
  isWinner,
  bye,
  pending,
}: {
  name: string | null
  isWinner: boolean
  bye: boolean
  pending: boolean
}) {
  const text = name ?? (bye ? 'Bye' : pending ? '—' : 'TBD')
  const empty = name === null

  return (
    <span
      style={{
        fontSize: 12,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontStyle: empty ? 'italic' : undefined,
        color: empty ? t.faint : isWinner ? t.good : t.dim,
      }}
    >
      {text}
    </span>
  )
}
