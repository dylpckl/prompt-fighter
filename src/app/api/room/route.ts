import { NextResponse } from 'next/server'
import { createHash, randomInt } from 'node:crypto'

import { supabaseAdmin } from '@/lib/server/supabase'
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

/**
 * What the rate limit counts, and the reason it is not `sessionId`.
 *
 * A session id is a UUID the browser generates and puts in the body, so any
 * limit keyed on it counts zero forever: send a fresh one each time. The
 * forwarded client address is the only identifier in the request the caller
 * doesn't choose, so that is what gets counted — hashed, because a room table
 * has no business holding IP addresses, and only the first hop of
 * `x-forwarded-for`, since anything after it is caller-supplied too.
 *
 * Behind a proxy that strips the header this degrades to the session id and the
 * limit is as soft as it was before. That is why it is not the only defence:
 * bracket results deliberately don't touch the public record (see
 * `_advance.ts`), so a flood of rooms costs rows and nothing else.
 */
function rateKey(req: Request, sessionId: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || req.headers.get('x-real-ip')?.trim()
  if (!address) return `session:${sessionId}`
  return `ip:${createHash('sha256').update(address).digest('hex').slice(0, 32)}`
}

/** Opens a lobby. The creator is the host and the only one who can start it. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const size = parseRoomSize(body.size)

    const db = supabaseAdmin()
    const hostKey = rateKey(req, sessionId)

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
