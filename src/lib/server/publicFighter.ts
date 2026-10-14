import { cache } from 'react'

import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { hydrateFighter, parseUuid } from '@/lib/engine/validate'
import type { Fighter, FighterPrompts } from '@/lib/engine/types'

/**
 * The one lookup of a fighter by id: the public projection, hydrated, plus the
 * two private columns a caller needs to decide whether to reveal prompts.
 * `session_id` comes back for comparison only — never put it in a response.
 *
 * Null for a missing row. Throws a ValidationError for a bad id and rethrows
 * database errors, so a route can tell 400 from 404 from 500.
 */
export async function loadFighterRow(
  id: string,
): Promise<{ fighter: Fighter; sessionId: string; prompts: FighterPrompts } | null> {
  const { data, error } = await supabaseAdmin()
    .from('fighters')
    .select(`${PUBLIC_FIGHTER_COLUMNS}, session_id, prompts`)
    .eq('id', parseUuid(id, 'fighter'))
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as { session_id: string; prompts: FighterPrompts }
  // hydrateFighter strips session_id and prompts from the fighter itself.
  return { fighter: hydrateFighter(data), sessionId: row.session_id, prompts: row.prompts }
}

/**
 * Public projection only, for server-rendered metadata and share images.
 * Null on any failure — a link preview should degrade to the generic one, never
 * fail the page. Cached per request, so metadata and page share one lookup.
 */
export const loadPublicFighter = cache(async (id: string): Promise<Fighter | null> => {
  try {
    return (await loadFighterRow(id))?.fighter ?? null
  } catch {
    return null
  }
})
