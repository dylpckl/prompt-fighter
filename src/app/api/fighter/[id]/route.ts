import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/server/supabase'
import { ValidationError, parseUuid } from '@/lib/engine/validate'

export const runtime = 'nodejs'

/**
 * Lets a returning player pick their fighter back up. Reads go through here
 * rather than PostgREST so the browser never needs a Supabase key at all.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const fighterId = parseUuid(id, 'fighter')

    const { data, error } = await supabaseAdmin()
      .from('fighters')
      .select('*')
      .eq('id', fighterId)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'No such fighter.' }, { status: 404 })

    return NextResponse.json({ fighter: data })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('fighter lookup failed:', err)
    return NextResponse.json({ error: 'Something broke.' }, { status: 500 })
  }
}
