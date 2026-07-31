import type { Fighter, FighterPrompts, SimResult } from '@/lib/engine/types'

export interface FightResult extends SimResult {
  opponent: Fighter
  seed: number
}

/**
 * Everything is same-origin now, so there are no keys, no CORS, and no base
 * URL to configure — the browser never talks to Supabase directly.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = payload as { error?: string } | null
    throw new Error(detail?.error ?? `Request failed (${res.status})`)
  }
  return payload as T
}

export function createFighter(
  sessionId: string,
  prompts: FighterPrompts,
): Promise<{ fighter: Fighter }> {
  return request('/api/create-fighter', {
    method: 'POST',
    body: JSON.stringify({ sessionId, prompts }),
  })
}

export function requestFight(sessionId: string, fighterId: string): Promise<FightResult> {
  return request('/api/fight', {
    method: 'POST',
    body: JSON.stringify({ sessionId, fighterId }),
  })
}

export async function fetchFighter(id: string): Promise<Fighter | null> {
  try {
    const { fighter } = await request<{ fighter: Fighter }>(`/api/fighter/${encodeURIComponent(id)}`)
    return fighter
  } catch {
    return null
  }
}
