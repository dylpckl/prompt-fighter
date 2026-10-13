import { supabaseAdmin } from '@/lib/server/supabase'
import { PUBLIC_FIGHTER_COLUMNS } from '@/lib/server/fighters'
import { hydrateFighter, parseUuid } from '@/lib/engine/validate'
import type { Fighter } from '@/lib/engine/types'

/**
 * One fighter's public projection, for server-rendered metadata and share
 * images. Null for a bad id, a missing row, or a database that can't be reached
 * — a link preview should degrade to the generic one, never fail the page.
 */
export async function loadPublicFighter(id: string): Promise<Fighter | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select(PUBLIC_FIGHTER_COLUMNS)
      .eq('id', parseUuid(id, 'fighter'))
      .maybeSingle()
    if (error || !data) return null
    return hydrateFighter(data)
  } catch {
    return null
  }
}
