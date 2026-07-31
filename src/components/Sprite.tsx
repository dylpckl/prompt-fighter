import { useEffect, useRef } from 'react'
import { SPRITE_SIZE } from '../types.ts'
import type { Sprite as SpriteData } from '../types.ts'

interface Props {
  sprite: SpriteData
  scale?: number
  /** Sprites are drawn facing right; flip the opponent to face the player. */
  flip?: boolean
  idle?: boolean
  hitKey?: number
}

export function Sprite({ sprite, scale = 8, flip = false, idle = true, hitKey = 0 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
    for (let y = 0; y < SPRITE_SIZE; y++) {
      const row = sprite.rows[y] ?? ''
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const index = Number(row[x] ?? '0')
        if (!index) continue // 0 is transparent
        ctx.fillStyle = sprite.palette[index] ?? '#ff00ff'
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [sprite])

  const size = SPRITE_SIZE * scale

  return (
    <div
      // Remounting on hitKey restarts the flash animation.
      key={hitKey}
      style={{
        width: size,
        height: size,
        animation: hitKey > 0 ? 'hit 320ms ease-out' : undefined,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          animation: idle ? 'bob 1.6s ease-in-out infinite' : undefined,
        }}
      >
        <canvas
          ref={ref}
          width={SPRITE_SIZE}
          height={SPRITE_SIZE}
          style={{
            width: size,
            height: size,
            transform: flip ? 'scaleX(-1)' : undefined,
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}
