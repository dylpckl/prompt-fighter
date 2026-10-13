import { MAX_LIVES } from '@/lib/engine/types'
import { t } from '@/theme'

/** One pip per life. Filled while it's still there. */
export function Lives({ lost, size = 10 }: { lost: number; size?: number }) {
  const left = Math.max(0, MAX_LIVES - lost)
  return (
    <span
      role="img"
      aria-label={left === 0 ? 'No lives left' : `${left} of ${MAX_LIVES} lives left`}
      style={{ display: 'inline-flex', gap: Math.max(3, size / 3), alignItems: 'center' }}
    >
      {Array.from({ length: MAX_LIVES }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            background: i < left ? t.accent : 'transparent',
            border: `1px solid ${i < left ? t.accent : t.faint}`,
          }}
        />
      ))}
    </span>
  )
}
