/**
 * Plain-language descriptions of what each property actually does in the sim.
 *
 * These are the numbers from `engine/sim.ts` — if a coefficient changes there,
 * change it here too. Nothing enforces that, so keep the two side by side.
 */
import type { FlawEffect, MoveEffect, Stats } from '@/lib/engine/types'

export const STAT_HELP: Record<keyof Stats, string> = {
  hp: 'Your health pool: 40, plus 8 per point. A 3 is 64 HP; a 12 is 136.',
  atk: 'Scales every hit you land — damage is roughly power × (attack ÷ (their defense + 10)) × 7.',
  def: 'Blunts incoming damage. It sits in a divisor, so the first few points help more than the last few.',
  spd: 'Decides who acts first, and nothing else. It does not give you more turns or charge your meter faster.',
  cha: 'Fills the crowd meter every beat, faster the more favorites you have. Cap it and you win on presence — politics, a roast, a wedding — whatever the health bars say.',
  wil: 'Resists all three pressure meters at once, with diminishing returns. It never makes you immune, it only buys time.',
  arc: 'Fills the hex meter every beat. Cap it and the fight ends in a curse, a banishment, or something nobody can explain.',
  luk: 'Fills the fate meter every beat. Cap it and you win on circumstance — a lapsed licence, a market crash, the promoter being your parent.',
}

export const MOVE_HELP: Record<MoveEffect, string> = {
  damage: 'A clean hit with no modifier.',
  heavy: 'Hits 1.6× as hard, but misses a quarter of the time.',
  heal: 'Restores 4 HP per point of power instead of attacking.',
  guard: 'Halves the next hit you take.',
  drain: 'Hits at 0.7× and heals you for half the damage it deals.',
  stun: 'Hits at 0.8×, with a 35% chance to cost them their next action.',
}

export const FLAW_HELP: Record<FlawEffect, string> = {
  glass: 'You take 25% more damage from every hit that lands.',
  slow_start: 'You forfeit your first action of the fight.',
  stamina: 'From your 7th action onward, every action costs you 4 HP.',
  wild: 'Every move you throw is 20% more likely to miss.',
  overheat: 'Every signature move costs you 8 HP. It can finish you.',
}

export const FAVORITE_HELP =
  'Every player has one favorite. A fighter’s favorites multiply their crowd meter and nothing else, with diminishing returns — one is worth about 4%, twelve about 25%, and it never passes 50%. It multiplies Presence, so it is worth nothing at all to a fighter who never bought any.'

export const RULES_HELP =
  'Whatever the player asked for that the numbers above could not express. Each rule is one “when this happens, that happens” sentence, and unlike stats there is no budget on them — a fighter described as invulnerable is invulnerable. The engine guarantees exactly one thing: the fight ends.'

export const METER_HELP =
  'Signature meter. Three actions charge it and the fourth fires your signature move. Lost turns — a stun, a slow start — do not charge it.'
