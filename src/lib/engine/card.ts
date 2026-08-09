// The card's pure model — what a fighter's public face shows and nothing it
// doesn't. Four aggregate bars (see face.ts), both move names, the flaw name,
// and at most one Special: the marquee rule, if the fighter has one. No raw
// numbers reach the card; those stay in the generation/debug surfaces.
import type { Fighter } from './types'
import { faceBars, type FaceBar } from './face'

export interface CardModel {
  bars: FaceBar[]
  moveNames: [string, string]
  flawName: string
  special: { name: string; text: string } | null
}

export function cardModel(fighter: Fighter): CardModel {
  const marquee = fighter.rules?.find((r) => r.marquee)
  return {
    bars: faceBars(fighter.stats),
    moveNames: [fighter.moves[0].name, fighter.moves[1].name],
    flawName: fighter.flaw.name,
    special: marquee ? { name: marquee.name, text: marquee.text } : null,
  }
}
