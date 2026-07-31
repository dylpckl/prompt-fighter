/**
 * A room code parked while the visitor goes off to build a fighter.
 *
 * Somebody following a shared /room/XXXX link with no fighter on this device
 * can't join anything, so we send them to the builder — and this is how they
 * find their way back instead of landing on the game screen wondering what the
 * link was for. Device-local, non-secret, same as everything else in storage.
 */
const RETURN_KEY = 'pf.room.return'

export function setReturnRoom(code: string | null): void {
  if (typeof window === 'undefined') return
  if (code) localStorage.setItem(RETURN_KEY, code)
  else localStorage.removeItem(RETURN_KEY)
}

export function getReturnRoom(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(RETURN_KEY)
}
