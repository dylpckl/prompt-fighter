'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { RoomEntry } from '@/screens/RoomEntry'
import { getStoredFighterId } from '@/lib/session'
import { label } from '@/theme'

/** The front door for bracket mode, so the nav has somewhere to point. */
export default function RoomsPage() {
  const router = useRouter()
  const [fighterId, setFighterId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Same rule as the other screens: storage only exists after mount.
  useEffect(() => {
    setFighterId(getStoredFighterId())
    setReady(true)
  }, [])

  return (
    <div className="shell">
      {ready ? (
        <RoomEntry fighterId={fighterId} onBuild={() => router.push('/')} />
      ) : (
        <p style={{ ...label, textAlign: 'center' }}>Loading…</p>
      )}
    </div>
  )
}
