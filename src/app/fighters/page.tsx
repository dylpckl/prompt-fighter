'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Sprite } from '@/components/Sprite'
import { fetchMyFighters, type RosterEntry } from '@/lib/api'
import { getSessionId, getStoredFighterId, setStoredFighterId } from '@/lib/session'
import { button, label, panel, t } from '@/theme'

export default function FightersPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<RosterEntry[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // localStorage only exists after mount, same as the game screen.
  useEffect(() => {
    let cancelled = false
    setActiveId(getStoredFighterId())

    fetchMyFighters(getSessionId())
      .then((res) => {
        if (!cancelled) setEntries(res.fighters)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load your fighters.')
        setEntries([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Making one active is the whole point of the list — the game screen picks it
  // up from storage on mount and fetches the full row.
  function choose(id: string) {
    setStoredFighterId(id)
    router.push('/')
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>Your fighters</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
          Everything you&rsquo;ve built on this device. Pick one to take back into the arena.
        </p>
      </div>

      {entries === null && <p style={{ ...label, margin: 0 }}>Loading…</p>}

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {entries?.length === 0 && !error && (
        <div style={{ ...panel, padding: 20, display: 'grid', gap: 14, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: t.dim, lineHeight: 1.5 }}>
            Nothing here yet. Clearing site data starts you over — that&rsquo;s the trade for
            having no accounts.
          </p>
          <button onClick={() => router.push('/')} style={button()}>
            Build one
          </button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {entries.map((f) => {
            const isActive = f.id === activeId
            return (
              <button
                key={f.id}
                onClick={() => choose(f.id)}
                style={{
                  ...panel,
                  borderColor: isActive ? t.accent : t.line,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'inherit',
                  width: '100%',
                }}
              >
                {/* Still in the list, so no idle bob — twelve bobbing sprites is a lot. */}
                <Sprite sprite={f.sprite} scale={3} idle={false} />

                <span style={{ display: 'grid', gap: 3, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: 14,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {f.name}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: t.dim,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {f.title}
                  </span>
                </span>

                <span style={{ display: 'grid', gap: 3, justifyItems: 'end', flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontFamily: t.mono }}>
                    <span style={{ color: f.wins > 0 ? t.good : t.faint }}>{f.wins}</span>
                    <span style={{ color: t.faint }}>–</span>
                    <span style={{ color: f.losses > 0 ? t.accent : t.faint }}>{f.losses}</span>
                  </span>
                  <span style={{ ...label, fontSize: 9, color: isActive ? t.accent : t.faint }}>
                    {isActive ? 'Active' : 'W–L'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
