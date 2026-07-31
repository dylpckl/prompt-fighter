'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { Sprite } from '@/components/Sprite'
import { FighterPanel } from '@/components/FighterPanel'
import { fetchFighter } from '@/lib/api'
import type { Fighter } from '@/lib/engine/types'
import { button, label, panel, t } from '@/theme'

export default function FighterDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = params?.id
    if (!id) return

    fetchFighter(id).then((found) => {
      if (cancelled) return
      if (found) setFighter(found)
      else setMissing(true)
    })

    return () => {
      cancelled = true
    }
  }, [params?.id])

  if (missing) {
    return (
      <div className="shell" style={{ display: 'grid', gap: 16 }}>
        <div style={{ ...panel, padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: t.dim }}>No such fighter.</p>
        </div>
        <button onClick={() => router.push('/leaderboard')} style={button('ghost')}>
          Back to leaderboard
        </button>
      </div>
    )
  }

  if (!fighter) {
    return (
      <div className="shell">
        <p style={{ ...label, margin: 0 }}>Loading…</p>
      </div>
    )
  }

  const fights = fighter.wins + fighter.losses

  return (
    <div className="shell" style={{ display: 'grid', gap: 12 }}>
      {/* The same stage the fight screen uses, so a fighter reads the same here
          as it does mid-bout. */}
      <div
        style={{
          ...panel,
          position: 'relative',
          height: 200,
          overflow: 'hidden',
          background: `linear-gradient(180deg, #0e0e11 0%, ${t.panel} 100%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 62,
            background: t.panelHi,
            borderTop: `1px solid ${t.line}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 62,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Sprite sprite={fighter.sprite} scale={7} />
        </div>
      </div>

      <FighterPanel fighter={fighter} />

      <div
        style={{
          ...panel,
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ ...label, margin: 0 }}>Record</span>
        <span style={{ fontSize: 14, fontFamily: t.mono }}>
          <span style={{ color: fighter.wins > 0 ? t.good : t.faint }}>{fighter.wins}W</span>
          <span style={{ color: t.faint }}> · </span>
          <span style={{ color: fighter.losses > 0 ? t.accent : t.faint }}>{fighter.losses}L</span>
          {fights > 0 && (
            <span style={{ color: t.faint, fontSize: 11 }}>
              {'  '}
              {Math.round((fighter.wins / fights) * 100)}%
            </span>
          )}
        </span>
      </div>

      <button onClick={() => router.push('/leaderboard')} style={button('ghost')}>
        Back to leaderboard
      </button>
    </div>
  )
}
