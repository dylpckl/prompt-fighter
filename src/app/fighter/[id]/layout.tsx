import type { Metadata } from 'next'
import { loadPublicFighter } from '@/lib/server/publicFighter'

/** The page is a client component; this is what gives a shared link a real title. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const fighter = await loadPublicFighter((await params).id)
  if (!fighter) return {}

  const title = fighter.dead_at ? `${fighter.name} (dead) — prompt fighter` : `${fighter.name} — prompt fighter`
  const description = fighter.dead_at
    ? `${fighter.title}. Died ${fighter.wins}–${fighter.losses}. See what it was made of.`
    : `${fighter.title}. ${fighter.wins}–${fighter.losses}, rated ${fighter.rating}.`
  return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } }
}

export default function FighterLayout({ children }: { children: React.ReactNode }) {
  return children
}
