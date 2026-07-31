import { NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'

import { supabaseAdmin } from '@/lib/server/supabase'
import { clientKey } from '@/lib/server/clientKey'
import { ValidationError, parseUuid } from '@/lib/engine/validate'
import { parseRoomSize, roomCodeFrom } from '@/lib/engine/bracket'

export const runtime = 'nodejs'

/** 32^4 codes against a handful of live rooms — a collision is a retry, not a problem. */
const CODE_ATTEMPTS = 8
const ROOMS_PER_HOUR = 10

/** Unique-violation. The only insert error here that isn't a real failure. */
const UNIQUE_VIOLATION = '23505'

function errorCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

/** Opens a lobby. The creator is the host and the only one who can start it. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const size = parseRoomSize(body.size)

    const db = supabaseAdmin()
    // Not `sessionId`: a limit keyed on a UUID the caller invents counts zero
    // forever. See lib/server/clientKey.ts for what this is and what it isn't.
    const hostKey = clientKey(req, sessionId)

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await db
      .from('rooms')
      .select('code', { count: 'exact', head: true })
      .eq('host_key', hostKey)
      .gte('created_at', since)

    if (countError) throw countError
    if ((count ?? 0) >= ROOMS_PER_HOUR) {
      return NextResponse.json(
        { error: "You've opened a lot of rooms. Give it an hour." },
        { status: 429 },
      )
    }

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const { data, error } = await db
        .from('rooms')
        .insert({
          code: roomCodeFrom((max) => randomInt(0, max)),
          host_session: sessionId,
          host_key: hostKey,
          size,
          // Every match seed in the bracket is derived from this one.
          seed: randomInt(0, 2 ** 31),
        })
        .select('code')
        .single()

      if (!error) return NextResponse.json({ code: data.code as string })
      if (errorCode(error) !== UNIQUE_VIOLATION) throw error
    }

    return NextResponse.json(
      { error: 'Every code we tried was taken. Try again.' },
      { status: 503 },
    )
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('room create failed:', err)
    return NextResponse.json({ error: 'Something broke opening the room.' }, { status: 500 })
  }
}
