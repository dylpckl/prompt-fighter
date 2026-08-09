import { NextResponse } from 'next/server'

import { RefusedError, generateFighter } from '@/lib/server/generate'
import { supabaseAdmin } from '@/lib/server/supabase'
import { signCandidate } from '@/lib/server/sign'
import { normalizeSpecials } from '@/lib/engine/specials'
import {
  ValidationError,
  normalizeFlaw,
  normalizeMove,
  normalizeRules,
  normalizeSprite,
  normalizeStats,
  parsePrompts,
  parseUuid,
} from '@/lib/engine/validate'
import type { Candidate } from '@/lib/engine/types'

export const runtime = 'nodejs'
// Generation is the slowest thing in the app; give it room before the platform
// cuts the request off.
export const maxDuration = 60

// Counts PERSISTED rows for this session, so it only bites a session that has
// already used up its hourly quota of *created* fighters. This endpoint never
// persists — a session that only calls generate and never calls create keeps
// count=0 forever, so this gate does NOT bound generate-only model spend; that
// stays effectively unbounded per session. The real control for a generate-only
// cost-DoS has to be IP/edge rate limiting, which this per-session cap can't
// substitute for since `session_id` is client-controlled and cheap to rotate.
// TODO(follow-up): IP/edge rate limit for /api/generate-fighter — see PR notes
const FIGHTERS_PER_HOUR = 10

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const prompts = parsePrompts(body.prompts)

    const db = supabaseAdmin()

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await db
      .from('fighters')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .gte('created_at', since)

    if (countError) throw countError
    if ((count ?? 0) >= FIGHTERS_PER_HOUR) {
      return NextResponse.json(
        { error: "You've made a lot of fighters. Give it an hour." },
        { status: 429 },
      )
    }

    const generated = await generateFighter(prompts)
    if (!generated.safe) {
      return NextResponse.json(
        { error: "That fighter didn't make it past the door. Try something else." },
        { status: 422 },
      )
    }

    // Same normalizers a stored fighter has always gone through — the schema is
    // the anti-cheat, not the model (CLAUDE.md), so this is what turns a merely
    // plausible generation into one safe to sign and eventually persist.
    const candidate: Candidate = {
      name: (generated.name || 'Nameless').trim().slice(0, 24),
      title: (generated.title || 'Unproven').trim().slice(0, 32),
      stats: normalizeStats(generated.stats),
      moves: [normalizeMove(generated.basic, 'basic'), normalizeMove(generated.special, 'special')],
      flaw: normalizeFlaw(generated.flaw),
      // The background set — everything the prompt implies except the one
      // standout idea, which lives in `specials` below. `/api/create-fighter`
      // folds the chosen Special into this via `assembleRules`.
      rules: normalizeRules(generated.rules),
      sprite: normalizeSprite(generated.palette, generated.sprite),
    }
    const specials = normalizeSpecials(generated.specials)

    // The anti-cheat: rules are deliberately unbounded (lib/engine/rules.ts), so
    // a client that could hand `/api/create-fighter` its own candidate could
    // POST `fight_start → win_now` straight past generation and the safety
    // gate. Signing here and verifying there is what closes that off.
    const signature = signCandidate({ candidate, specials })

    return NextResponse.json({ candidate, specials, signature })
  } catch (err) {
    if (err instanceof RefusedError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('generate-fighter failed:', err)
    return NextResponse.json(
      { error: 'Something broke while building your fighter.' },
      { status: 500 },
    )
  }
}
