import { NextResponse } from 'next/server'

import { clientKey } from '@/lib/server/clientKey'
import type { supabaseAdmin } from '@/lib/server/supabase'

// Every attempt costs a model call, so these count attempts, not fighters — a
// refused or unsafe prompt is billed too. See migration 0006.
const PER_SESSION_PER_HOUR = 10
// Looser than per-session: a room full of people on one wifi shares an address.
const PER_CLIENT_PER_HOUR = 30
// The ceiling on the daily bill, across everyone.
const PER_DAY = Number(process.env.GENERATIONS_PER_DAY) || 500

const REFUSALS: Record<string, string> = {
  session: "You've made a lot of fighters. Give it an hour.",
  client: "You've made a lot of fighters. Give it an hour.",
  global: 'The forge is closed for today. Come back tomorrow.',
}

/**
 * Records one model call against every limit, or returns the 429 to send.
 * Call it immediately before the model, after everything that can fail for
 * free — creating fighters and editing them share the one budget.
 */
export async function claimGeneration(
  db: ReturnType<typeof supabaseAdmin>,
  req: Request,
  sessionId: string,
): Promise<NextResponse | null> {
  const { data: claim, error } = await db.rpc('claim_generation', {
    p_client_key: clientKey(req, sessionId),
    p_session: sessionId,
    p_per_session: PER_SESSION_PER_HOUR,
    p_per_client: PER_CLIENT_PER_HOUR,
    p_per_day: PER_DAY,
  })
  if (error) throw error
  if (claim === 'ok') return null
  return NextResponse.json({ error: REFUSALS[claim as string] ?? REFUSALS.session }, { status: 429 })
}
