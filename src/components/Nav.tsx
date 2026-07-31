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
  { href: '/room', text: 'Rooms' },
  // Shortened when Rooms joined the row: four labels at this tracking overflow
  // a 375px phone otherwise, and the header must not scroll sideways.
  { href: '/fighters', text: 'Fighters' },
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
          prompt fighter
        </Link>

        <nav className="nav__links">
          {LINKS.map((l) => {
            // A room lives at /room/CODE, so the tab has to stay lit once
            // you're inside one.
            const active = l.href === '/room' ? pathname.startsWith('/room') : pathname === l.href
            return (
              <Link key={l.href} href={l.href} style={{ ...link, color: active ? t.text : t.faint }}>
                {l.text}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
