'use client'

import { useParams } from 'next/navigation'
import { Room } from '@/screens/Room'

/**
 * The shareable half of bracket mode. The code is the URL, so a link, a
 * screenshot and someone shouting four characters all get you to the same
 * place. Everything below the route is client-side polling — there is no
 * websocket and the browser still holds no credentials.
 */
export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const raw = params?.code
  const code = (typeof raw === 'string' ? raw : '').toUpperCase()

  return <Room code={code} />
}
