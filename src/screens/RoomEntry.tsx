import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createRoom } from '@/lib/api'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_SIZES, type RoomSize } from '@/lib/engine/bracket'
import { getSessionId } from '@/lib/session'
import { button, label, panel, t } from '@/theme'

interface Props {
  /** Null when this device has no fighter — you can still spectate a room. */
  fighterId: string | null
  onBuild: () => void
  onBack?: () => void
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

/** Open a room or walk into one. Both routes end at /room/CODE. */
export function RoomEntry({ fighterId, onBuild, onBack }: Props) {
  const router = useRouter()
  const [size, setSize] = useState<RoomSize>(8)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = code.length === ROOM_CODE_LENGTH

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const { code: made } = await createRoom(getSessionId(), size)
      router.push(`/room/${made}`)
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, animation: 'fadeUp 260ms ease-out' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>Play with friends</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
          Everyone brings a fighter, everyone watches the same bracket at the same time. One
          screen each, or one screen between you.
        </p>
      </div>

      {!fighterId && (
        <div style={{ ...panel, padding: 16, display: 'grid', gap: 12, borderColor: t.warn }}>
          <p style={{ margin: 0, fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
            You need a fighter before you can enter one. You can still join a room to watch.
          </p>
          <button onClick={onBuild} style={button()}>
            Build a fighter
          </button>
        </div>
      )}

      <div style={{ ...panel, padding: 16, display: 'grid', gap: 12 }}>
        <p style={{ ...label, margin: 0 }}>Open a room</p>

        <div style={{ display: 'flex', gap: 8 }}>
          {ROOM_SIZES.map((n) => (
            <button
              key={n}
              onClick={() => setSize(n)}
              style={{
                ...button('ghost'),
                padding: '10px 0',
                color: n === size ? t.text : t.dim,
                borderColor: n === size ? t.accent : t.line,
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <p style={{ margin: 0, fontSize: 12, color: t.faint, lineHeight: 1.5 }}>
          Seats on offer. Fewer people can start — short brackets just hand out byes.
        </p>

        <button onClick={create} disabled={busy || !fighterId} style={button()}>
          {busy ? 'Opening…' : 'Create room'}
        </button>
      </div>

      <div style={{ ...panel, padding: 16, display: 'grid', gap: 12 }}>
        <p style={{ ...label, margin: 0 }}>Join with a code</p>

        <input
          value={code}
          onChange={(e) => setCode(clean(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) router.push(`/room/${code}`)
          }}
          placeholder="XXXX"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          style={{
            background: t.panelHi,
            border: `1px solid ${t.line}`,
            borderRadius: 3,
            padding: '14px 12px',
            fontFamily: t.mono,
            fontSize: 28,
            letterSpacing: '0.4em',
            textAlign: 'center',
            width: '100%',
            outline: 'none',
          }}
        />

        <button
          onClick={() => router.push(`/room/${code}`)}
          disabled={!ready}
          style={button(ready ? 'primary' : 'ghost')}
        >
          Go
        </button>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {onBack && (
        <button onClick={onBack} style={button('ghost')}>
          Back
        </button>
      )}
    </div>
  )
}

/** The alphabet has no O/0 or I/1, so a typed one is a typo — drop it early. */
function clean(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH)
}
