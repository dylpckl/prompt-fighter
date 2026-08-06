/**
 * What a fighter row is allowed to look like once it leaves the server.
 *
 * `session_id` is the only credential this app has: `/api/fight` authorises a
 * bout by matching `session_id` + `fighterId`, and `/api/fighters` lists a
 * roster by it. Anyone holding another player's `session_id` can fight with
 * their fighter and move its record. It must never be serialised to a client.
 *
 * `prompts` are the player's own writing and nothing in the UI renders another
 * fighter's, so they stay server-side too.
 */
/**
 * `rules` is public on purpose, unlike `prompts`. A fighter's rules are the
 * fighter — half of what someone built is in there, the sheet is unreadable
 * without them, and a fight where the other side's behaviour is hidden is a
 * fight nobody can follow. They also contain none of the player's own writing:
 * the generator names and describes each rule itself.
 */
export const PUBLIC_FIGHTER_COLUMNS =
  'id, name, title, stats, moves, flaw, rules, sprite, wins, losses, favorites, created_at'

const PRIVATE_KEYS = ['session_id', 'prompts'] as const

/**
 * For rows that don't come from a column-projected select — `pick_ghost`
 * returns `setof public.fighters`, so the opponent arrives complete and has to
 * be stripped here instead.
 */
export function toPublicFighter<T extends object>(row: T): Omit<T, 'session_id' | 'prompts'> {
  const copy = { ...row } as Record<string, unknown>
  for (const key of PRIVATE_KEYS) delete copy[key]
  return copy as Omit<T, 'session_id' | 'prompts'>
}
