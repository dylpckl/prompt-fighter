'use client'

import { useEffect, useState } from 'react'

import { Hint } from '@/components/Hint'
import { clearFavorite, fetchMyFavorite, fetchMyFighters, setFavorite } from '@/lib/api'
import { crowdSupportPercent } from '@/lib/engine/favorites'
import { FAVORITE_HELP } from '@/lib/explain'
import { getSessionId } from '@/lib/session'
import { button, label, panel, t } from '@/theme'

/**
 * The one favorite a player gets, and what it buys the fighter.
 *
 * Backing someone is a move, not an accumulation: choosing a new fighter takes
 * the vote off whoever had it. The button says so rather than making people
 * discover it — "Back this fighter" when the vote is free, "Move your favorite
 * here" when it isn't.
 *
 * The count and the percentage are shown together on purpose. The boost is
 * asymptotic (see lib/engine/favorites.ts), so a raw count tells you nothing
 * about what it is worth; showing both is what stops the number reading like a
 * stat that keeps climbing.
 */
export function FavoriteButton({ fighterId, count }: { fighterId: string; count: number }) {
  const [total, setTotal] = useState(count)
  const [favorited, setFavorited] = useState<boolean | null>(null)
  /** Whether the player already backs someone else — changes what the button says. */
  const [elsewhere, setElsewhere] = useState(false)
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The count comes from the parent's fetch; a re-fetch there should win.
  useEffect(() => setTotal(count), [count])

  useEffect(() => {
    let cancelled = false
    const sessionId = getSessionId()

    // Ownership is checked here as well as on the server. The server's 400 is
    // the rule; this is just so the button doesn't offer something it can't do.
    Promise.all([fetchMyFavorite(sessionId), fetchMyFighters(sessionId)])
      .then(([favorite, roster]) => {
        if (cancelled) return
        setFavorited(favorite.fighterId === fighterId)
        setElsewhere(favorite.fighterId !== null && favorite.fighterId !== fighterId)
        setMine(roster.fighters.some((f) => f.id === fighterId))
      })
      .catch(() => {
        // A failed lookup shouldn't hide the count. Treat it as "not backed" and
        // let the write path report anything that's actually wrong.
        if (!cancelled) setFavorited(false)
      })

    return () => {
      cancelled = true
    }
  }, [fighterId])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      const sessionId = getSessionId()
      if (favorited) {
        await clearFavorite(sessionId)
        setFavorited(false)
        setTotal((n) => Math.max(0, n - 1))
      } else {
        const result = await setFavorite(sessionId, fighterId)
        setFavorited(true)
        setElsewhere(false)
        // The server's count is authoritative — it knows about everyone else's
        // votes since this page loaded, and a local +1 wouldn't.
        setTotal(result.favorites)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That did not take.')
    } finally {
      setBusy(false)
    }
  }

  const boost = crowdSupportPercent(total)

  return (
    <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...label, margin: 0 }}>
          <Hint text={FAVORITE_HELP}>Favorites</Hint>
        </span>
        <span style={{ fontSize: 14, fontFamily: t.mono }}>
          <span style={{ color: total > 0 ? t.text : t.faint }}>{total}</span>
          <span style={{ color: t.faint, fontSize: 11 }}>
            {'  '}
            {boost > 0 ? `+${boost}% crowd` : 'no crowd yet'}
          </span>
        </span>
      </div>

      {mine ? (
        <p style={{ margin: 0, fontSize: 12, color: t.dim, lineHeight: 1.5 }}>
          This one&rsquo;s yours. Favorites have to come from somebody else — that&rsquo;s what
          makes the number mean anything.
        </p>
      ) : (
        <>
          <button
            onClick={toggle}
            disabled={busy || favorited === null}
            style={{
              ...button(favorited ? 'ghost' : 'primary'),
              cursor: busy || favorited === null ? 'default' : 'pointer',
              opacity: busy || favorited === null ? 0.6 : 1,
            }}
          >
            {favorited === null
              ? 'Loading…'
              : favorited
                ? 'Backing this fighter'
                : elsewhere
                  ? 'Move your favorite here'
                  : 'Back this fighter'}
          </button>

          <p style={{ margin: 0, fontSize: 12, color: t.dim, lineHeight: 1.5 }}>
            {favorited
              ? 'Press again to take it back. You get one favorite, and it lifts their crowd meter.'
              : 'You get one favorite. It lifts their crowd meter — and only theirs.'}
          </p>
        </>
      )}

      {error && <p style={{ margin: 0, fontSize: 12, color: t.accent }}>{error}</p>}
    </div>
  )
}
