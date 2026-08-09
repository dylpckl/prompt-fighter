import { normalizeRules } from './rules'
import type { Rule } from './rules'

export interface Special { name: string; text: string; rule: Rule }
const MAX_SPECIALS = 3

export function normalizeSpecials(value: unknown): Special[] {
  if (!Array.isArray(value)) return []
  const out: Special[] = []
  for (const raw of value) {
    if (out.length >= MAX_SPECIALS) break
    if (!raw || typeof raw !== 'object') continue
    const r = raw as { name?: unknown; flavor?: unknown; rule?: unknown }
    const [rule] = normalizeRules([r.rule])
    if (!rule) continue
    const name = typeof r.name === 'string' ? r.name.trim() : rule.name
    const text = typeof r.flavor === 'string' ? r.flavor.trim() : rule.text
    if (!name) continue
    out.push({ name, text, rule: { ...rule, name, text } })
  }
  return out
}
