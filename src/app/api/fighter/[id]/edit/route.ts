import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { claimGeneration } from '@/lib/server/limits'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { RefusedError, generateFighter } from '@/lib/server/generate'
import { buildEditPrompt } from '@/lib/engine/generation'
import {
  ValidationError,
  hydrateFighter,
  normalizeFlaw,
  normalizeMove,
  normalizeSprite,
  normalizeStats,
  parseEdit,
  parseUuid,
} from '@/lib/engine/validate'
import type { FighterPrompts, Sprite } from '@/lib/engine/types'

export const runtime = 'nodejs'
export const maxDuration = 60

type Db = ReturnType<typeof supabaseAdmin>

/**
 * Spend a banked edit: change one prompt slot and regenerate the fighter as the
 * next version of itself, keeping its id, name, record and lives.
 *
 * The edit is taken with a conditional UPDATE before the model call, so two
 * requests can't both spend it, and handed back if anything after that fails —
 * a refused prompt or a broken generation shouldn't cost the player their edit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const fighterId = parseUuid((await params).id, 'fighter')
    const body = await req.json().catch(() => ({}))
    const sessionId = parseUuid(body.sessionId, 'session')
    const { slot, text } = parseEdit(body)

    const db = supabaseAdmin()

    // Ownership is the session filter; the projection never returns it.
    const { data: current, error: readError } = await db
      .from('fighters')
      .select('name, title, prompts, sprite, version, dead_at, edits_available')
      .eq('id', fighterId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (readError) throw readError
    if (!current) return NextResponse.json({ error: "That fighter isn't yours." }, { status: 404 })
    if (current.dead_at) {
      return NextResponse.json({ error: `${current.name} is dead. Build someone new.` }, { status: 409 })
    }
    if (current.edits_available < 1) {
      return NextResponse.json({ error: 'No edit banked. Lose a fight to earn one.' }, { status: 409 })
    }

    const prompts = { ...(current.prompts as FighterPrompts), [slot]: text }
    if ((current.prompts as FighterPrompts)[slot] === text) {
      return NextResponse.json({ error: "That's what it already says." }, { status: 400 })
    }

    const { data: spent, error: spendError } = await db
      .from('fighters')
      .update({ edits_available: 0 })
      .eq('id', fighterId)
      .eq('session_id', sessionId)
      .eq('version', current.version)
      .is('dead_at', null)
      .gt('edits_available', 0)
      .select('id')
      .maybeSingle()

    if (spendError) throw spendError
    if (!spent) {
      return NextResponse.json({ error: 'That edit was already used.' }, { status: 409 })
    }

    try {
      const limited = await claimGeneration(db, req, sessionId)
      if (limited) {
        await refund(db, fighterId)
        return limited
      }

      const generated = await generateFighter(
        buildEditPrompt(
          { name: current.name, title: current.title, version: current.version, sprite: current.sprite as Sprite },
          prompts,
          slot,
        ),
      )
      if (!generated.safe) {
        await refund(db, fighterId)
        return NextResponse.json(
          { error: "That change didn't make it past the door. Try something else." },
          { status: 422 },
        )
      }

      const { data, error } = await db
        .from('fighters')
        .update({
          // The name is the fighter's identity across versions; the model
          // doesn't get a vote on it.
          title: (generated.title || current.title).trim().slice(0, 32),
          prompts,
          stats: normalizeStats(generated.stats),
          moves: [normalizeMove(generated.basic, 'basic'), normalizeMove(generated.special, 'special')],
          flaw: normalizeFlaw(generated.flaw),
          sprite: normalizeSprite(generated.palette, generated.sprite),
          version: current.version + 1,
        })
        .eq('id', fighterId)
        .eq('version', current.version)
        .select(PUBLIC_FIGHTER_COLUMNS)
        .single()
      if (error) throw error

      // The owner's own prompts come back so the next edit can start from them.
      return NextResponse.json({ fighter: { ...hydrateFighter(data), prompts } })
    } catch (err) {
      await refund(db, fighterId).catch((refundErr) => console.error('edit refund failed:', refundErr))
      throw err
    }
  } catch (err) {
    if (err instanceof RefusedError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('edit failed:', err)
    return NextResponse.json({ error: 'Something broke while rebuilding your fighter.' }, { status: 500 })
  }
}

/** Give the edit back. Only while alive — nothing to refund to the dead. */
async function refund(db: Db, fighterId: string): Promise<void> {
  const { error } = await db
    .from('fighters')
    .update({ edits_available: 1 })
    .eq('id', fighterId)
    .is('dead_at', null)
  if (error) throw error
}
