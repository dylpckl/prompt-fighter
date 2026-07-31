import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'

export const metadata: Metadata = {
  title: 'prompt fight',
  description: 'Four prompts, one fighter. Then find out whose held up.',
}

export const viewport: Viewport = {
  themeColor: '#0b0b0c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {/* Screens pick their own width via .shell / .shell--wide — the arena
            needs more room than the rest. */}
        <main style={{ padding: '24px 18px 48px' }}>{children}</main>
      </body>
    </html>
  )
}
