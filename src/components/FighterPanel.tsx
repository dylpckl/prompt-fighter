import type { Fighter } from '@/lib/engine/types'
import { StatBlock } from '@/components/StatBlock'
import { panel, t } from '@/theme'

/**
 * The fighter card used beside the battlefield. Shared so a fighter reads the
 * same wherever you meet it — mid-fight, or from the leaderboard.
 */
export function FighterPanel({ fighter }: { fighter: Fighter }) {
  return (
    <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fighter.name}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: t.dim }}>{fighter.title}</p>
      </div>
      <StatBlock fighter={fighter} />
    </div>
  )
}
