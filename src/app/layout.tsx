import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'

/**
 * Where share previews point. Absolute URLs are required for og:image, and
 * without a base Next falls back to localhost off Vercel. SITE_URL wins; on
 * Vercel the production domain is the fallback.
 */
function siteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL)
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return new URL(vercel ? `https://${vercel}` : 'http://localhost:3000')
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: 'prompt fighter',
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
        <main className="page">{children}</main>
      </body>
    </html>
  )
}
