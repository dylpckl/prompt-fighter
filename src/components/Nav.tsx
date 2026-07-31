'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { label, t } from '@/theme'

const link = {
  ...label,
  textDecoration: 'none',
  transition: 'color 120ms ease',
} as const

/**
 * Edge to edge: the wordmark sits against the left margin and the link against
 * the right, rather than tracking the 440px column the screens use. On a phone
 * the two are the same; on a wide window this reads as a header instead of a
 * floating centered pair.
 */
export function Nav() {
  const pathname = usePathname()
  const onRoster = pathname === '/fighters'

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: t.bg,
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <div
        style={{
          padding: '0 18px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Link href="/" style={{ ...link, color: onRoster ? t.dim : t.text }}>
          prompt fight
        </Link>
        <Link href="/fighters" style={{ ...link, color: onRoster ? t.text : t.faint }}>
          My fighters
        </Link>
      </div>
    </header>
  )
}
