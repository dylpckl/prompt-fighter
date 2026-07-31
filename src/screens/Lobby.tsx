import { useEffect, useState } from 'react'
import type { RoomEntrant } from '@/lib/api'
import { Sprite } from '@/components/Sprite'
import { button, label, panel, t } from '@/theme'

interface Props {
  code: string
  /** Seats on offer. The bracket itself fits whoever actually showed up. */
  size: number
  entrants: RoomEntrant[]
  isHost: boolean
  onStart: () => void
  starting: boolean
  error: string | null
  /** Set when this visitor has no fighter yet and therefore can't take a seat. */
  onBuildFighter: (() => void) | null
}

export function Lobby({
  code,
  size,
  entrants,
  isHost,
  onStart,
  starting,
  error,
  onBuildFighter,
}: Props) {
  const canStart = entrants.length >= 2
  const seats = Array.from({ length: size }, (_, i) => entrants.find((e) => e.seat === i) ?? null)

  return (
    <div style={{ display: 'grid', gap: 16, animation: 'fadeUp 260ms ease-out' }}>
      <CodeCard code={code} />

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <p style={{ ...label, margin: 0 }}>Entrants</p>
          <p style={{ ...label, margin: 0, color: t.faint }}>
            {entrants.length} / {size}
          </p>
        </div>

        <div className="lobby__seats">
          {seats.map((entrant, i) => (
            <Seat key={i} entrant={entrant} />
          ))}
        </div>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {onBuildFighter && (
        <div style={{ ...panel, padding: 16, display: 'grid', gap: 12, borderColor: t.warn }}>
          <p style={{ margin: 0, fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
            You&rsquo;re watching, not fighting — there&rsquo;s no fighter on this device. Build one
            and we&rsquo;ll bring you straight back to {code}.
          </p>
          <button onClick={onBuildFighter} style={button()}>
            Build a fighter
          </button>
        </div>
      )}

      {isHost ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Nothing to start below two — the button stays away rather than
              sitting there greyed out. */}
          {canStart && (
            <button onClick={onStart} disabled={starting} style={button()}>
              {starting ? 'Drawing the bracket…' : 'Start the bracket'}
            </button>
          )}
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: t.faint,
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            {canStart
              ? 'Anyone who hasn’t joined by then is a spectator.'
              : 'Two entrants minimum. Read the code out.'}
          </p>
        </div>
      ) : (
        <p
          style={{
            ...label,
            margin: 0,
            textAlign: 'center',
            color: t.dim,
            animation: 'fadeUp 260ms ease-out',
          }}
        >
          Waiting for the host…
        </p>
      )}
    </div>
  )
}

/**
 * The code is the whole interface for the people across the room, so it gets
 * the biggest type on the site. The share link underneath is for the ones close
 * enough to hand a phone to.
 */
function CodeCard({ code }: { code: string }) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // location only exists in the browser, and reading it during render would
  // disagree with the server-rendered markup.
  useEffect(() => {
    setUrl(`${window.location.origin}/room/${code}`)
  }, [code])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      // Absent on http origins that aren't localhost; the link is still visible
      // and selectable, so failing quietly is the right amount of failure.
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{ ...panel, padding: '20px 16px', display: 'grid', gap: 14, justifyItems: 'center' }}>
      <p style={{ ...label, margin: 0 }}>Room code</p>

      <p className="lobby__code" style={{ margin: 0, fontFamily: t.mono }}>
        {code}
      </p>

      <div className="lobby__share">
        <span
          style={{
            fontSize: 12,
            color: t.dim,
            fontFamily: t.mono,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {url || '…'}
        </span>
        <button
          onClick={copy}
          disabled={!url}
          style={{ ...button('ghost'), width: 'auto', padding: '10px 14px', flexShrink: 0 }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function Seat({ entrant }: { entrant: RoomEntrant | null }) {
  if (!entrant) {
    return (
      <div
        style={{
          border: `1px dashed ${t.line}`,
          borderRadius: 4,
          padding: 10,
          minHeight: 86,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <span style={{ ...label, fontSize: 10, color: t.faint }}>Empty</span>
      </div>
    )
  }

  return (
    <div
      style={{
        ...panel,
        borderColor: entrant.is_you ? t.accent : t.line,
        padding: 10,
        minHeight: 86,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        animation: 'fadeUp 200ms ease-out',
      }}
    >
      {/* No idle bob: sixteen bobbing sprites in a grid is a lot of motion. */}
      {entrant.sprite ? (
        <Sprite sprite={entrant.sprite} scale={3} idle={false} />
      ) : (
        <div style={{ width: 48, height: 48, border: `1px dashed ${t.line}`, flexShrink: 0 }} />
      )}

      <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entrant.name}
        </span>
        <span style={{ ...label, fontSize: 9, color: entrant.is_you ? t.accent : t.faint }}>
          {entrant.is_you ? 'You' : `Seat ${entrant.seat + 1}`}
        </span>
      </div>
    </div>
  )
}
