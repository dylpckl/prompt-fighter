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
        {/* The page shell lives here so every route sits in the same column. */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 18px 48px' }}>
          <main style={{ width: '100%', maxWidth: 440 }}>{children}</main>
        </div>
      </body>
    </html>
  )
}
