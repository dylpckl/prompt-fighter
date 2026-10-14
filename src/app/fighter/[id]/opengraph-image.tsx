import { ImageResponse } from 'next/og'
import { loadPublicFighter } from '@/lib/server/publicFighter'
import { SPRITE_SIZE } from '@/lib/engine/types'
import { t } from '@/theme'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'A prompt fighter'

const PIXEL = 24

/** The link preview: the sprite, big, with the name and record beside it. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const fighter = await loadPublicFighter((await params).id)
  const dead = Boolean(fighter?.dead_at)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 64,
          padding: 72,
          background: t.bg,
          color: t.text,
          fontFamily: 'monospace',
        }}
      >
        {fighter && (
          <div style={{ display: 'flex', flexDirection: 'column', opacity: dead ? 0.35 : 1 }}>
            {Array.from({ length: SPRITE_SIZE }, (_, y) => (
              <div key={y} style={{ display: 'flex' }}>
                {Array.from({ length: SPRITE_SIZE }, (_, x) => fighter.sprite.rows?.[y]?.[x] ?? '0').map((cell, x) => (
                  <div
                    key={x}
                    style={{
                      width: PIXEL,
                      height: PIXEL,
                      // Same tolerance as components/Sprite.tsx: a short row reads
                      // as empty, and an index off the palette as magenta.
                      background: cell === '0' ? 'transparent' : (fighter.sprite.palette?.[Number(cell)] ?? '#ff00ff'),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          <div style={{ fontSize: 28, letterSpacing: 6, color: dead ? t.accent : t.dim }}>
            {dead ? 'OBITUARY' : 'PROMPT FIGHTER'}
          </div>
          <div style={{ fontSize: 64, lineHeight: 1.1 }}>{fighter?.name ?? 'prompt fighter'}</div>
          <div style={{ fontSize: 32, color: t.dim }}>
            {fighter?.title ?? 'Four prompts, one fighter.'}
          </div>
          {fighter && (
            <div style={{ fontSize: 30, color: t.faint }}>
              {`${fighter.wins}W · ${fighter.losses}L · ${fighter.rating}${fighter.version > 1 ? ` · v${fighter.version}` : ''}`}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  )
}
