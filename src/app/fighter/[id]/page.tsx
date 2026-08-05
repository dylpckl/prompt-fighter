'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { Sprite } from '@/components/Sprite'
import { FavoriteButton } from '@/components/FavoriteButton'
import { FighterPanel } from '@/components/FighterPanel'
import { fetchFighter, fetchMyFighters } from '@/lib/api'
import { getSessionId, setStoredFighterId } from '@/lib/session'
import type { Fighter } from '@/lib/engine/types'
import { button, label, panel, t } from '@/theme'

/** useSearchParams needs a boundary or the route can't be prerendered. */
export default function FighterDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="shell">
          <p style={{ ...label, margin: 0 }}>Loading…</p>
        </div>
      }
    >
      <FighterDetail />
    </Suspense>
  )
}

function FighterDetail() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()

  const [fighter, setFighter] = useState<Fighter | null>(null)
  const [missing, setMissing] = useState(false)
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set())

  const id = params?.id
  // Where the visitor came from decides where "back" goes. Defaults to the
  // leaderboard because that's the only one a shared link can reach.
  const fromRoster = search?.get('from') === 'fighters'

  useEffect(() => {
    let cancelled = false
    if (!id) return


    fetchFighter(id).then((found) => {
      if (cancelled) return
      if (found) setFighter(found)
      else setMissing(true)
    })

    // Ownership is a server fact, not something the URL can assert — a crafted
    // ?from=fighters shouldn't offer to fight with someone else's fighter.
    fetchMyFighters(getSessionId())
      .then((res) => {
        if (!cancelled) setMine(new Set(res.fighters.map((f) => f.id)))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [id])

  const backHref = fromRoster ? '/fighters' : '/leaderboard'
  const backLabel = fromRoster ? 'Back to my fighters' : 'Back to leaderboard'

  if (missing) {
    return (
      <div className="shell" style={{ display: 'grid', gap: 16 }}>
        <div style={{ ...panel, padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: t.dim }}>No such fighter.</p>
        </div>
        <button onClick={() => router.push(backHref)} style={button('ghost')}>
          {backLabel}
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
  const isMine = mine.has(fighter.id)

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

      <FavoriteButton fighterId={fighter.id} count={fighter.favorites} />

      {isMine && (
        // Straight into a fight. Routing to the game screen first only showed
        // this same card again with a Find opponent button on it — a click that
        // told the visitor nothing they weren't already looking at.
        <button
          onClick={() => {
            setStoredFighterId(fighter.id)
            router.push('/?fight=1')
          }}
          style={button()}
        >
          Find opponent
        </button>
      )}

      <button onClick={() => router.push(backHref)} style={button('ghost')}>
        {backLabel}
      </button>
    </div>
  )
}
