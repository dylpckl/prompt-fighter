import type { Fighter, FighterPrompts, SimResult } from '../types.ts'

const URL_BASE = import.meta.env.VITE_SUPABASE_URL
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export interface FightResult extends SimResult {
  opponent: Fighter
  seed: number
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${PUBLISHABLE_KEY}`,
  }
}

async function post<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${URL_BASE}/functions/v1/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      payload && typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`
    throw new Error(message)
  }
  return payload as T
}

export function createFighter(sessionId: string, prompts: FighterPrompts): Promise<{ fighter: Fighter }> {
  return post('create-fighter', { sessionId, prompts })
}

export function requestFight(sessionId: string, fighterId: string): Promise<FightResult> {
  return post('fight', { sessionId, fighterId })
}

/** Direct PostgREST read — fighters are publicly readable, so no function needed. */
export async function fetchFighter(id: string): Promise<Fighter | null> {
  const res = await fetch(`${URL_BASE}/rest/v1/fighters?id=eq.${encodeURIComponent(id)}&select=*`, {
    headers: headers(),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Fighter[]
  return rows[0] ?? null
}
