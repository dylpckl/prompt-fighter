const SESSION_KEY = 'pf.session'
const FIGHTER_KEY = 'pf.fighter'

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Older Safari — good enough for an anonymous, non-secret identifier.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Anonymous, device-local identity. Clearing storage orphans the fighter. */
export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function getStoredFighterId(): string | null {
  return localStorage.getItem(FIGHTER_KEY)
}

export function setStoredFighterId(id: string | null): void {
  if (id) localStorage.setItem(FIGHTER_KEY, id)
  else localStorage.removeItem(FIGHTER_KEY)
}
