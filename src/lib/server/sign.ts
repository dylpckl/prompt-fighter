import { createHmac, timingSafeEqual } from 'node:crypto'

/** Deterministic JSON: object keys sorted recursively, so signatures are stable. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

function secret(): string {
  const s = process.env.FIGHTER_SIGNING_SECRET
  if (!s) throw new Error('FIGHTER_SIGNING_SECRET is not set')
  return s
}

export function signCandidate(payload: unknown): string {
  return createHmac('sha256', secret()).update(canonical(payload)).digest('hex')
}

export function verifyCandidate(payload: unknown, sig: string): boolean {
  const expected = signCandidate(payload)
  const a = Buffer.from(expected), b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}
