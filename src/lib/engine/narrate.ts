import type { MoveEffect } from './types'

interface Beat {
  attacker: string
  defender: string
  move: string
  effect: MoveEffect
  damage: number
  heal: number
  missed: boolean
  lethal: boolean
}

/**
 * Templated narration. The creative work already happened upstream — the model
 * named the fighter and its moves — so stitching those names into a verb is
 * enough to read well, and it costs nothing per fight.
 */
export function narrate(b: Beat): string {
  if (b.missed) {
    return `${b.attacker} winds up ${b.move} — and whiffs.`
  }

  if (b.lethal) {
    return `${b.move} lands clean. ${b.defender} goes down.`
  }

  switch (b.effect) {
    case 'damage':
      return `${b.attacker} connects with ${b.move} for ${b.damage}.`
    case 'heavy':
      return `${b.move} comes down hard — ${b.damage} to ${b.defender}.`
    case 'heal':
      return b.heal > 0
        ? `${b.attacker} steadies with ${b.move}, recovering ${b.heal}.`
        : `${b.attacker} tries ${b.move}, but there's nothing left to mend.`
    case 'guard':
      return `${b.attacker} sets ${b.move}, bracing for the next hit.`
    case 'drain':
      return `${b.move} bites for ${b.damage} and feeds ${b.heal} back to ${b.attacker}.`
    case 'stun':
      return `${b.move} rattles ${b.defender} for ${b.damage}.`
  }
}

export function stunnedText(name: string): string {
  return `${name} is still shaking it off.`
}

export function hesitateText(name: string): string {
  return `${name} is slow off the mark.`
}

export function selfHarmText(name: string, amount: number, reason: 'overheat' | 'stamina'): string {
  return reason === 'overheat'
    ? `The effort costs ${name} ${amount}.`
    : `${name} is running out of wind — ${amount} lost.`
}
