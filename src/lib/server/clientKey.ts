import { createHash } from 'node:crypto'

/**
 * The closest thing this app has to "who is calling", for the two places that
 * need to count something per person.
 *
 * A session id is a UUID the browser generates and puts in the body, so any cap
 * keyed on it counts zero forever: send a fresh one each time. The forwarded
 * client address is the only identifier in the request the caller doesn't
 * choose, so that is what gets hashed — hashed, because neither a room table nor
 * a favorites table has any business holding IP addresses, and only the first
 * hop of `x-forwarded-for`, since everything after it is caller-supplied too.
 *
 * Behind a proxy that strips the header this degrades to the session id and the
 * cap is as soft as it was before. That is why it is never the only defence:
 *
 *  - `/api/room` counts rooms per hour with it, and bracket results deliberately
 *    don't touch the public record (see `_advance.ts`), so a flood of rooms
 *    costs rows and nothing else.
 *  - `/api/favorite` holds one live vote per key, and the boost a vote buys is
 *    asymptotic and capped (see `lib/engine/favorites.ts`), so a farmed favorite
 *    is worth a sliver of one meter rather than a win.
 *
 * Shared rather than copied because it is the same judgement call in both
 * places, and a copy is how two callers quietly stop agreeing about it.
 */
export function clientKey(req: Request, sessionId: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || req.headers.get('x-real-ip')?.trim()
  if (!address) return `session:${sessionId}`
  return `ip:${createHash('sha256').update(address).digest('hex').slice(0, 32)}`
}
