import { normalizeRules } from './rules'
import type { Rule } from './rules'
import type { Special } from './specials'

const sig = (r: Rule) => JSON.stringify([r.when.on, r.when.value, r.then.do, r.then.value, r.then.track])

/** Final rules = background + chosen Special (marquee), deduped, ≤6. */
export function assembleRules(background: Rule[], chosen: Special | null): Rule[] {
  if (!chosen) return normalizeRules(background)
  const marquee: Rule = { ...chosen.rule, name: chosen.name, text: chosen.text, marquee: true }
  const key = sig(marquee)
  const kept = background.filter((r) => sig(r) !== key)
  return normalizeRules([marquee, ...kept]) // marquee first survives the ≤6 truncation
}
