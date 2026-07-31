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
const LINKS = [
  { href: '/fighters', text: 'My fighters' },
  { href: '/leaderboard', text: 'Leaderboard' },
] as const

export function Nav() {
  const pathname = usePathname()
  const onGame = pathname === '/'

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
        <Link href="/" style={{ ...link, color: onGame ? t.text : t.dim }}>
          prompt fight
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{ ...link, color: pathname === l.href ? t.text : t.faint }}
            >
              {l.text}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
