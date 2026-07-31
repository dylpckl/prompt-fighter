'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Sprite } from '@/components/Sprite'
import { fetchLeaderboard, type RosterEntry } from '@/lib/api'
import { getStoredFighterId } from '@/lib/session'
import { label, panel, t } from '@/theme'

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<RosterEntry[] | null>(null)
  const [mineId, setMineId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setMineId(getStoredFighterId())

    fetchLeaderboard()
      .then((res) => {
        if (!cancelled) setEntries(res.fighters)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the leaderboard.')
        setEntries([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="shell" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>Leaderboard</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
          The whole pool, ranked by wins. Everyone here is someone&rsquo;s ghost.
        </p>
      </div>

      {entries === null && <p style={{ ...label, margin: 0 }}>Loading…</p>}

      {error && <p style={{ margin: 0, fontSize: 13, color: t.accent }}>{error}</p>}

      {entries?.length === 0 && !error && (
        <div style={{ ...panel, padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: t.dim, lineHeight: 1.5 }}>
            Nobody has fought yet. Be the first result on the board.
          </p>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {entries.map((f, i) => {
            const isMine = f.id === mineId
            const fights = f.wins + f.losses
            const rate = fights > 0 ? Math.round((f.wins / fights) * 100) : 0

            return (
              <Link
                key={f.id}
                href={`/fighter/${f.id}`}
                style={{
                  ...panel,
                  borderColor: isMine ? t.accent : t.line,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    ...label,
                    fontSize: 13,
                    color: i < 3 ? t.text : t.faint,
                    width: 24,
                    flexShrink: 0,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>

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
                    {isMine && (
                      <span style={{ ...label, fontSize: 9, color: t.accent, marginLeft: 8 }}>
                        Yours
                      </span>
                    )}
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
                  <span style={{ ...label, fontSize: 9, color: t.faint }}>
                    {rate}%{f.favorites > 0 && ` · ${f.favorites} fav`}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
