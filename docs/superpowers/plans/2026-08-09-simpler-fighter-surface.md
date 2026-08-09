# Simpler Fighter Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a fighter a glanceable four-bar face and a "pick 1 of 3 Specials" creation step, while keeping PR #6's honor-anything rules engine fully intact underneath.

**Architecture:** The fight engine (`sim.ts`, `victory.ts`, `rules.ts` interpreter, pressure) is untouched. All work is presentation (a four-bar display aggregation replacing the eight-stat wall), one new creation choice (three candidate Specials, generated → signed → picked → persisted), and one integrity guard (unconditional `immune` normalizes to total immunity, in code). Design doc: `docs/superpowers/specs/2026-08-09-simpler-fighter-surface-design.md`.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, Vitest, Supabase (Postgres jsonb), Anthropic SDK (`claude-sonnet-5`), inline styles from `src/theme.ts`.

## Global Constraints

- **Responsive at 375px and 1280px.** After any card/UI change, verify in a browser that `document.documentElement.scrollWidth === document.documentElement.clientWidth` at both widths. Grid children holding text need `min-width: 0`. (CLAUDE.md)
- **The engine is off-limits.** Do not modify `sim.ts`, `victory.ts`, the `rules.ts` interpreter (`fireRules`/`matches`/`apply`), pressure math, or `favorites.ts`. Only `rules.ts`'s *type* and *normalization* (`normalizeRule`) may change (Task 2).
- **Schema is the anti-cheat, and rules are deliberately unbounded.** `normalizeRules` clamps a rule's shape but NOT its power — so a persisted rule must never come from the client. Generated candidates are **HMAC-signed** at generation and verified on persist (Tasks 5-6). Never trust client-supplied stats/moves/rules. (CLAUDE.md)
- **Never serialise `session_id`**; never `select('*')` on `fighters` in a route that returns the row — use `PUBLIC_FIGHTER_COLUMNS` / `toPublicFighter()`. `session_id`, `wins`, `losses`, `id`, `created_at` come from auth / DB defaults, never the payload. (CLAUDE.md)
- **Colours from `theme.ts`.** No hardcoded hex. Inline styles only; width-dependent rules go in `globals.css`. (CLAUDE.md)
- **Naming:** the generation schema's `special` field = the *signature move* (`generation.ts:116` → `moves[1]`). The redesign's marquee power is `specials` (candidates) / `marquee` (chosen). The client helper is `generateCandidates` (the server function `generate.ts:generateFighter` keeps its name). Never conflate.
- **Test command:** `npx vitest run` (all) / `npx vitest run tests/<file>` (one). Typecheck: `npx tsc --noEmit`. Vitest discovers **`tests/**/*.test.ts` only** (`vitest.config.ts:5`) with **no JSX transform and no jsdom** — so all tests are `.ts` and assert against pure helpers, never rendered components. Do NOT run `npm run build` while `next dev` is running (CLAUDE.md).
- **Commit style:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Four-bar face aggregation (with a named Spirit peak)

**Files:**
- Create: `src/lib/engine/face.ts`
- Test: `tests/face.test.ts`

**Interfaces:**
- Produces: `faceBars(stats: Stats): FaceBar[]` where `FaceBar = { key: 'power'|'speed'|'toughness'|'spirit'; label: string; value: number; max: number }`. Display-only; never read by the sim. The `spirit` bar's `label` is the *name* of the peak spirit stat (Presence/Resolve/Weirdness/Fate).

- [ ] **Step 1: Write the failing test** (fixtures use LEGAL budgets — body sums to `STAT_TOTAL` 30, spirit to `SPIRIT_TOTAL` 20)

```ts
// tests/face.test.ts
import { describe, it, expect } from 'vitest'
import { faceBars } from '../src/lib/engine/face'
import { STAT_MAX, SPIRIT_MAX } from '../src/lib/engine/types'

// body 8+12+7+3 = 30; spirit 8+6+4+2 = 20 (both legal budgets)
const stats = { hp: 8, atk: 12, def: 7, spd: 3, cha: 8, wil: 6, arc: 4, luk: 2 }

describe('faceBars', () => {
  it('produces exactly four bars in order', () => {
    expect(faceBars(stats).map((b) => b.key)).toEqual(['power', 'speed', 'toughness', 'spirit'])
  })
  it('maps raw stats to abstracted values and ceilings', () => {
    const [power, speed, tough, spirit] = faceBars(stats)
    expect([power.value, power.max]).toEqual([12, STAT_MAX])
    expect(speed.value).toBe(3)
    expect([tough.value, tough.max]).toEqual([15, STAT_MAX * 2]) // hp 8 + def 7
    expect([spirit.value, spirit.max]).toEqual([8, SPIRIT_MAX])   // peak = cha 8
  })
  it('labels the spirit bar with the peak stat name', () => {
    expect(faceBars(stats)[3].label).toBe('Presence') // cha is the peak
    expect(faceBars({ ...stats, cha: 2, luk: 8 })[3].label).toBe('Fate') // luk peak
  })
  it('every value stays within its own ceiling', () => {
    for (const b of faceBars(stats)) expect(b.value / b.max).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run tests/face.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/engine/face.ts
// Display-only aggregation of the eight raw stats into the four bars the card
// shows. The sim never reads these. Spirit is the peak of the four spirit stats,
// labeled by which one — because the spirit four spend a FIXED 20-pt budget, so
// their sum is constant across fighters and useless; the peak (and its name) vary.
import type { Stats, SpiritKey } from './types'
import { STAT_MAX, SPIRIT_MAX } from './types'

export interface FaceBar {
  key: 'power' | 'speed' | 'toughness' | 'spirit'
  label: string
  value: number
  max: number
}

const SPIRIT_LABEL: Record<SpiritKey, string> = {
  cha: 'Presence', wil: 'Resolve', arc: 'Weirdness', luk: 'Fate',
}

export function faceBars(stats: Stats): FaceBar[] {
  const keys: SpiritKey[] = ['cha', 'wil', 'arc', 'luk']
  const peak = keys.reduce((best, k) => (stats[k] > stats[best] ? k : best), 'cha' as SpiritKey)
  return [
    { key: 'power', label: 'Power', value: stats.atk, max: STAT_MAX },
    { key: 'speed', label: 'Speed', value: stats.spd, max: STAT_MAX },
    { key: 'toughness', label: 'Toughness', value: stats.hp + stats.def, max: STAT_MAX * 2 },
    { key: 'spirit', label: SPIRIT_LABEL[peak], value: stats[peak], max: SPIRIT_MAX },
  ]
}
```

(If `SpiritKey` isn't exported from `types.ts`, it is — `types.ts:44`.)

- [ ] **Step 4: Run test to verify it passes.** `npx vitest run tests/face.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/face.ts tests/face.test.ts
git commit -m "feat: four-bar face aggregation with named Spirit peak"
```

---

### Task 2: Marquee flag + absolutes-in-code

**Files:**
- Modify: `src/lib/engine/rules.ts` — `Rule` interface (≈160-171); `normalizeRule` (≈262-310, which **rebuilds the rule object from scratch** at ≈302-309, so every kept field must be re-added explicitly; `chance` clamp ≈307, `times` clamp ≈308)
- Test: `tests/rules-absolute.test.ts`

**Interfaces:**
- Produces: `Rule` gains `marquee?: boolean` (the chosen Special). `normalizeRule` (a) preserves `marquee`, and (b) forces `chance = 100`, `times = 0` when the action is `immune` fired from an unconditional trigger (`when_i_am_hit`, `always`, `my_turn`, `fight_start`, `their_turn`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/rules-absolute.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeRules } from '../src/lib/engine/rules'

const rule = (over: object) => ({
  name: 'X', text: 'x',
  when: { on: 'when_i_am_hit', value: 0 },
  then: { do: 'immune', value: 0 },
  chance: 65, times: 3, ...over,
})

describe('absolutes stay absolute (code, not model)', () => {
  it('forces chance=100/times=0 for immune on an unconditional trigger', () => {
    const [r] = normalizeRules([rule({})])
    expect([r.chance, r.times]).toEqual([100, 0])
  })
  it('leaves a CONDITIONALLY-triggered immune hedged as written', () => {
    const [r] = normalizeRules([rule({ when: { on: 'my_hp_below', value: 30 }, chance: 50, times: 2 })])
    expect([r.chance, r.times]).toEqual([50, 2])
  })
  it('does NOT force win_now (a low-odds instakill is a real design)', () => {
    const [r] = normalizeRules([rule({ then: { do: 'win_now', value: 0 }, when: { on: 'when_i_attack', value: 0 }, chance: 5 })])
    expect(r.chance).toBe(5)
  })
  it('preserves the marquee flag', () => {
    const [r] = normalizeRules([rule({ marquee: true })])
    expect(r.marquee).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/rules-absolute.test.ts` → FAIL (chance stays 65; marquee undefined).

- [ ] **Step 3: Extend the `Rule` interface** (rules.ts ≈160-171), after `times`:

```ts
  /** The one power named on the card. Set by the creation "pick a Special" step. */
  marquee?: boolean
```

- [ ] **Step 4: Enforce in `normalizeRule`.** Read the function (≈262-310); it resolves the trigger into `when.on` and the action into `then.do`, then rebuilds the returned object. Just above the `return`, add:

```ts
  const UNCONDITIONAL = new Set(['when_i_am_hit', 'always', 'my_turn', 'fight_start', 'their_turn'])
  // "Invulnerable" = immune fired from a whenever-trigger → total & permanent, in code.
  // A conditionally-triggered immune (my_hp_below, coin_flip, when_they_use) is a designed
  // power and keeps its numbers. Other all-or-nothing actions (win_now, silence_them) keep
  // their odds too — a low-chance instawin/silence is legitimate.
  const forceAbsolute = then.do === 'immune' && UNCONDITIONAL.has(when.on)
  const marquee = (raw as { marquee?: unknown }).marquee === true
```

Then in the rebuilt object, replace the chance/times lines and add marquee:

```ts
    chance: forceAbsolute ? 100 : Math.round(num(raw.chance, 100, 1, 100)),
    times: forceAbsolute ? 0 : Math.round(num(raw.times, 0, 0, 99)),
    ...(marquee ? { marquee: true } : {}),
```

(Use the actual local variable names the function uses for the resolved `when`/`then` — read them first.)

- [ ] **Step 5: Run to verify it passes.** `npx vitest run tests/rules-absolute.test.ts` → PASS (4 tests).

- [ ] **Step 6: Full engine suite — nothing regressed.** `npx vitest run` → all 143 existing tests still green. (The `toEqual` rule fixtures in `tests/rules.test.ts` don't use `immune` + unconditional trigger with hedged numbers, so they're unaffected — confirm.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/rules.ts tests/rules-absolute.test.ts
git commit -m "feat: marquee flag; immune from a whenever-trigger normalizes to total immunity"
```

---

### Task 3: Card model + StatBlock rework (four bars + names, no numbers)

**Files:**
- Create: `src/lib/engine/card.ts` — pure `cardModel(fighter)` (the testable seam)
- Modify: `src/components/StatBlock.tsx` (read fully first; ≈1-165) — render from `cardModel`
- Test: `tests/card.test.ts`

**Interfaces:**
- Consumes: `faceBars` (Task 1), `Rule.marquee` (Task 2), `Fighter`.
- Produces: `cardModel(fighter: Fighter): { bars: FaceBar[]; moveNames: [string, string]; flawName: string; special: { name: string; text: string } | null }`. `special` is `null` when the fighter has no marquee rule.

- [ ] **Step 1: Write the failing test** (fixture uses a legal spread; asserts the pure model, not HTML)

```ts
// tests/card.test.ts
import { describe, it, expect } from 'vitest'
import { cardModel } from '../src/lib/engine/card'
import type { Fighter } from '../src/lib/engine/types'

const base = {
  id: 'x', name: 'Nan', title: 'the Warded',
  stats: { hp: 8, atk: 12, def: 7, spd: 3, cha: 8, wil: 6, arc: 4, luk: 2 },
  moves: [{ name: 'Backhand', power: 5, effect: 'damage' }, { name: 'Grudge', power: 9, effect: 'heavy' }],
  flaw: { name: 'Glass Jaw', effect: 'glass' },
  sprite: { palette: [], rows: [] }, wins: 0, losses: 0, favorites: 0,
} as unknown as Fighter

describe('cardModel', () => {
  it('exposes four bars, both move names, and the flaw name — no numbers', () => {
    const m = cardModel({ ...base, rules: [] } as Fighter)
    expect(m.bars.map((b) => b.key)).toEqual(['power', 'speed', 'toughness', 'spirit'])
    expect(m.moveNames).toEqual(['Backhand', 'Grudge'])
    expect(m.flawName).toBe('Glass Jaw')
    expect(m.special).toBeNull()
  })
  it('surfaces the marquee rule as the Special (name + flavor)', () => {
    const rules = [
      { name: 'Grudge Engine', text: 'stronger on a miss', when: { on: 'when_i_miss', value: 0 }, then: { do: 'boost_atk', value: 2 }, chance: 100, times: 0 },
      { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 100, times: 0, marquee: true },
    ]
    expect(cardModel({ ...base, rules } as Fighter).special).toEqual({ name: 'Ward', text: 'nothing gets through' })
  })
})
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/card.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `cardModel`**

```ts
// src/lib/engine/card.ts
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
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run tests/card.test.ts` → PASS (2 tests).

- [ ] **Step 5: Rewrite `StatBlock.tsx` to render from `cardModel`.** Replace the whole component. Drop `describeRule`, per-stat `StatRow`, and `MoveRow`'s `{effect} · {power}`. Use a proportional fill bar (aggregates have big ceilings — 24, 10 — so fill by fraction, not per-point segments):

```tsx
import type { Fighter } from '@/lib/engine/types'
import { cardModel } from '@/lib/engine/card'
import { FLAW_HELP, RULES_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { label, t } from '@/theme'

export function StatBlock({ fighter }: { fighter: Fighter }) {
  const { bars, moveNames, flawName, special } = cardModel(fighter)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {bars.map((bar) => (
        <FaceRow key={bar.key} name={bar.label} value={bar.value} max={bar.max} />
      ))}

      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
        <NameRow tag="Basic" name={moveNames[0]} />
        <NameRow tag="Signature" name={moveNames[1]} />
        <NameRow tag="Flaw" name={flawName} help={FLAW_HELP[fighter.flaw.effect]} accent />
      </div>

      {special && (
        <div style={{ display: 'grid', gap: 2, marginTop: 4, minWidth: 0,
          borderTop: `1px solid ${t.line}`, paddingTop: 8 }}>
          <span style={{ ...label, fontSize: 10, color: t.faint }}>
            <Hint text={RULES_HELP}>Special</Hint>
          </span>
          <span style={{ fontSize: 13, color: t.accent, overflowWrap: 'anywhere' }}>{special.name}</span>
          <span style={{ fontSize: 11, color: t.dim, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{special.text}</span>
        </div>
      )}
    </div>
  )
}

function FaceRow({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ ...label, width: 82, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, minWidth: 0, height: 8, background: t.panelHi, border: `1px solid ${t.line}`, padding: 1 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: t.text }} />
      </div>
    </div>
  )
}

function NameRow({ tag, name, help, accent }: { tag: string; name: string; help?: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ ...label, width: 82, flexShrink: 0, color: accent ? t.accent : undefined }}>{tag}</span>
      <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{help ? <Hint text={help}>{name}</Hint> : name}</span>
    </div>
  )
}
```

Notes: label width `82` fits "Toughness" and "Weirdness"; verify no clip at 375px. All `t.*` tokens exist in `theme.ts`. `describeRule` stays exported in `rules.ts` (its only remaining caller is `tests/rules.test.ts`) — do NOT delete it here.

- [ ] **Step 6: Typecheck + full suite.** `npx tsc --noEmit && npx vitest run` → PASS.

- [ ] **Step 7: Responsive check.** `npx next dev`; open a fighter detail page at 375px and 1280px; confirm no horizontal overflow. Stop dev before any build.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine/card.ts src/components/StatBlock.tsx tests/card.test.ts
git commit -m "feat: card shows four bars + move/flaw/Special names via cardModel, no stat wall"
```

---

### Task 4: Four-bar face in VersusPreview

**Files:**
- Modify: `src/screens/VersusPreview.tsx` — `CompareRow` is **defined at ≈210-257** and **invoked at ≈55-81** (raw numbers at ≈226-235/245-254). Moves/flaw are already name-only (≈85-108) — leave them.

**Interfaces:** Consumes `faceBars` (Task 1).

- [ ] **Step 1: Read `VersusPreview.tsx` in full**, confirming where the eight stats are compared.

- [ ] **Step 2: Replace the eight stat comparisons with four.** For `i` in `0..3`, compare `faceBars(a.stats)[i]` vs `faceBars(b.stats)[i]` — same visual language as the current `CompareRow`, but using the abstracted `label`/`value`/`max` and **no raw numbers** (match the card). Note the two fighters' `spirit` bars may carry different labels (each side's own peak); render each side's own label.

- [ ] **Step 3: Responsive check at 375/1280** on the versus screen.

- [ ] **Step 4: Typecheck + full suite.** `npx tsc --noEmit && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/VersusPreview.tsx
git commit -m "feat: versus preview uses the four-bar face"
```

---

### Task 5: Generation — three *distinct* candidate Specials, signed

**Files:**
- Create: `src/lib/server/sign.ts` — HMAC sign/verify for a generated candidate
- Create: `src/lib/engine/specials.ts` — `normalizeSpecials`
- Modify: `src/lib/engine/generation.ts` — `FIGHTER_SCHEMA` (≈77-142) + `SYSTEM_PROMPT` (≈144-248, Rules section ≈200-231)
- Modify: `src/lib/server/generate.ts` — `Generated` (≈13-24)
- Test: `tests/specials.test.ts`, `tests/sign.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSpecials(value: unknown): Special[]` where `Special = { name: string; text: string; rule: Rule }` — validated, **0–3** entries, each `rule` run through `normalizeRules` (so an unconditional `immune` is already total).
  - `signCandidate(payload: unknown): string` and `verifyCandidate(payload: unknown, sig: string): boolean` (HMAC-SHA256 over a canonical JSON of the payload, using `process.env.FIGHTER_SIGNING_SECRET`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/specials.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSpecials } from '../src/lib/engine/specials'
const one = { name: 'Ward', flavor: 'nothing gets through',
  rule: { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 60, times: 2 } }
describe('normalizeSpecials', () => {
  it('keeps 0..3 well-formed specials and normalizes the rule (immune→total)', () => {
    const [s] = normalizeSpecials([one])
    expect(s.name).toBe('Ward')
    expect([s.rule.chance, s.rule.times]).toEqual([100, 0]) // via normalizeRules
  })
  it('drops malformed entries, caps at three, and returns [] for non-arrays', () => {
    expect(normalizeSpecials([one, one, one, one, { junk: 1 }]).length).toBe(3)
    expect(normalizeSpecials(null)).toEqual([])
    expect(normalizeSpecials([])).toEqual([])
  })
})
```

```ts
// tests/sign.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { signCandidate, verifyCandidate } from '../src/lib/server/sign'
beforeAll(() => { process.env.FIGHTER_SIGNING_SECRET = 'test-secret' })
describe('candidate signing', () => {
  it('verifies an unmodified payload and rejects a tampered one', () => {
    const payload = { stats: { atk: 5 }, specials: [{ name: 'A' }] }
    const sig = signCandidate(payload)
    expect(verifyCandidate(payload, sig)).toBe(true)
    expect(verifyCandidate({ ...payload, stats: { atk: 99 } }, sig)).toBe(false)
  })
  it('is stable across key order (canonical)', () => {
    expect(signCandidate({ a: 1, b: 2 })).toBe(signCandidate({ b: 2, a: 1 }))
  })
})
```

- [ ] **Step 2: Run to verify they fail.** `npx vitest run tests/specials.test.ts tests/sign.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement `sign.ts`**

```ts
// src/lib/server/sign.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Deterministic JSON: object keys sorted recursively, so signatures are stable. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

function secret(): string {
  const s = process.env.FIGHTER_SIGNING_SECRET
  if (!s) throw new Error('FIGHTER_SIGNING_SECRET is not set')
  return s
}

export function signCandidate(payload: unknown): string {
  return createHmac('sha256', secret()).update(canonical(payload)).digest('hex')
}

export function verifyCandidate(payload: unknown, sig: string): boolean {
  const expected = signCandidate(payload)
  const a = Buffer.from(expected), b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Implement `specials.ts`**

```ts
// src/lib/engine/specials.ts
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
```

- [ ] **Step 5: Run to verify they pass.** `npx vitest run tests/specials.test.ts tests/sign.test.ts` → PASS.

- [ ] **Step 6: Widen `Generated` + `FIGHTER_SCHEMA`.** Add `specials: unknown` to `Generated` (`generate.ts` ≈13-24). In `generation.ts`, add a `specialsSchema` — an array of `{ name, flavor, rule }` objects reusing the existing `ruleSchema` for `rule` — referenced from `FIGHTER_SCHEMA`. (JSON-schema structured outputs can't enforce array length; the count is requested in the prompt and enforced by `normalizeSpecials`.) **No `absolute` field** — absoluteness is now derived in `normalizeRule` (Task 2).

- [ ] **Step 7: Update `SYSTEM_PROMPT`** (Rules section ≈200-231), terse copy (schema descriptions are billed full-price every call — CLAUDE.md):
  - Base `rules` carry the fighter's **full** honored behaviour — everything the prompt implies *except* the single standout idea. Do not thin them out.
  - `specials`: **three reads of the one standout idea**, and they must differ in **mechanic** (e.g. one `immune`, one `reflect`, one `revive`) so the choice is real. Each has a `name` and a one-line `flavor`. If the prompt has no standout idea (a plain description), return an empty `specials` array — do not invent powers.
  - Keep the existing invulnerable→`when_i_am_hit`/`immune` guidance (≈204).

- [ ] **Step 8: Typecheck + full suite.** `npx tsc --noEmit && npx vitest run` → PASS. Add `FIGHTER_SIGNING_SECRET` to `.env.local` and document it in `.env.example` if present.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/sign.ts src/lib/engine/specials.ts src/lib/engine/generation.ts src/lib/server/generate.ts tests/specials.test.ts tests/sign.test.ts
git commit -m "feat: generate 0-3 mechanically-distinct Specials; sign candidates"
```

---

### Task 6: Creation flow — generate (signed, rate-limited) → choose → persist (verified)

**Files:**
- Create: `src/lib/engine/assemble.ts` — `assembleRules`
- Create: `src/app/api/generate-fighter/route.ts` — generate + safety gate + sign; **no insert**
- Modify: `src/app/api/create-fighter/route.ts` — verify signature, assemble, insert (read it fully first)
- Modify: `src/lib/api.ts` (`createFighter` ≈41-49) — add `generateCandidates`; change `createFighter` signature
- Modify: `src/app/page.tsx` (`Game`; screen union ≈15; `handleCreate` ≈76-99) — add `'choose'` state, handle 0 Specials
- Create: `src/screens/Choose.tsx`
- Test: `tests/assemble.test.ts`

**Interfaces:**
- Consumes: `normalizeSpecials`/`Special` (Task 5), `signCandidate`/`verifyCandidate` (Task 5), `Rule.marquee` (Task 2), existing `normalizeStats`/`normalizeRules`, `FIGHTERS_PER_HOUR` (existing in create-fighter route).
- Produces:
  - `assembleRules(background: Rule[], chosen: Special | null): Rule[]` — background + the chosen Special (`marquee: true`), **deduped** (drop a background rule structurally equal to the marquee), re-normalized, capped ≤ 6. `null` → just `normalizeRules(background)`.
  - `generateCandidates(prompts, sessionId): Promise<{ candidate: GeneratedFighter; specials: Special[]; signature: string }>` (client → `/api/generate-fighter`).
  - `createFighter(candidate, specials, signature, chosenIndex: number | null, sessionId): Promise<Fighter>` (client → `/api/create-fighter`).

- [ ] **Step 1: Write the failing test for `assembleRules`**

```ts
// tests/assemble.test.ts
import { describe, it, expect } from 'vitest'
import { assembleRules } from '../src/lib/engine/assemble'
const bg = { name: 'Grudge', text: 'stronger on a miss', when: { on: 'when_i_miss', value: 0 }, then: { do: 'boost_atk', value: 2 }, chance: 100, times: 0 }
const special = { name: 'Ward', text: 'nothing gets through',
  rule: { name: 'Ward', text: 'nothing gets through', when: { on: 'when_i_am_hit', value: 0 }, then: { do: 'immune', value: 0 }, chance: 100, times: 0 } }
describe('assembleRules', () => {
  it('marks the chosen Special marquee and keeps background', () => {
    const out = assembleRules([bg], special as never)
    expect(out.find((r) => r.marquee)?.name).toBe('Ward')
    expect(out.some((r) => r.name === 'Grudge' && !r.marquee)).toBe(true)
  })
  it('dedups a background rule identical to the marquee (no stacking)', () => {
    const dupe = { ...special.rule, name: 'Ward', text: 'nothing gets through' }
    const out = assembleRules([dupe as never], special as never)
    expect(out.filter((r) => r.then.do === 'immune')).toHaveLength(1)
  })
  it('null chosen → background only, no marquee', () => {
    const out = assembleRules([bg], null)
    expect(out.some((r) => r.marquee)).toBe(false)
  })
  it('caps at six', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...bg, name: `r${i}` }))
    expect(assembleRules(many, special as never).length).toBeLessThanOrEqual(6)
  })
})
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/assemble.test.ts` → FAIL.

- [ ] **Step 3: Implement `assembleRules`**

```ts
// src/lib/engine/assemble.ts
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
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run tests/assemble.test.ts` → PASS (4 tests).

- [ ] **Step 5: Build `/api/generate-fighter`.** Read `create-fighter/route.ts` fully. Move the generation half here: enforce the **per-session hourly limit (`FIGHTERS_PER_HOUR`)** (the model call is the costly op — this bounds spend), run generation, run the existing **safety gate** (`generated.safe`) and reject if unsafe, normalize the candidate with the **existing** normalizers (`normalizeStats`, `normalizeMove`×2, `normalizeFlaw`, `normalizeSprite`, name/title clamps) and `normalizeRules(generated.rules)` for background, and `normalizeSpecials(generated.specials)`. Return `{ candidate, specials, signature: signCandidate({ candidate, specials }) }`. **Do not insert.**

- [ ] **Step 6: Rewrite `/api/create-fighter`** to accept `{ candidate, specials, signature, chosenIndex }`. Steps: (a) `verifyCandidate({ candidate, specials }, signature)` — reject 400 on mismatch (this is the anti-cheat: only generation-authored, safety-passed candidates persist); (b) `chosen = chosenIndex == null ? null : specials[chosenIndex] ?? null`; (c) `rules = assembleRules(candidate.rules, chosen)`; (d) insert from **explicit named fields** off `candidate` (name, title, stats, moves, flaw, sprite) + `rules` + `session_id` from the request + `wins/losses` unset (DB defaults) — **never spread `candidate`**. Keep the existing row-count limit here. Return via `toPublicFighter`/`PUBLIC_FIGHTER_COLUMNS`.

- [ ] **Step 7: `src/lib/api.ts`** — add `generateCandidates(prompts, sessionId)` → POST `/api/generate-fighter`; change `createFighter` to `(candidate, specials, signature, chosenIndex, sessionId)` → POST `/api/create-fighter`. (Keep sending `sessionId` — the route needs it for `session_id` + limit.)

- [ ] **Step 8: `src/app/page.tsx`** — add `'choose'` to the screen union (≈15). In `handleCreate` (≈76-99): call `generateCandidates`; store `{ candidate, specials, signature }`; **if `specials.length === 0`, call `createFighter(candidate, specials, signature, null, sessionId)` and `setScreen('reveal')` directly** (no pick); otherwise `setScreen('choose')`.

- [ ] **Step 9: `src/screens/Choose.tsx`** — render the sprite, name, the four-bar face (reuse `faceBars`), and the `specials` (1–3) as tappable cards showing `name` + `text`. Copy guidance: because numbers are hidden, each card's `text` must telegraph its distinct mechanic ("nothing gets through" vs "throws blows back" vs "gets back up") so the choice reads as a real tradeoff. On pick `i`: `createFighter(candidate, specials, signature, i, sessionId)` → `setScreen('reveal')`. `Reveal.tsx` is unchanged (its `StatBlock` now shows the marquee).

- [ ] **Step 10: Manual end-to-end + responsive.** `npx next dev`; create a fighter with a gimmick prompt → three-card choose screen → pick → reveal shows that Special; create a plain "big strong guy" prompt → **choose screen is skipped**, reveal has no Special. Check 375/1280 on the choose screen. Stop dev before any build.

- [ ] **Step 11: Typecheck + full suite.** `npx tsc --noEmit && npx vitest run` → PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/engine/assemble.ts src/app/api/generate-fighter/route.ts src/app/api/create-fighter/route.ts src/lib/api.ts src/app/page.tsx src/screens/Choose.tsx tests/assemble.test.ts
git commit -m "feat: pick 1 of 3 Specials at creation (generate/sign -> choose -> verify/persist)"
```

---

### Task 7: Preview repurpose, responsive + regression pass, existing-fighter note

**Files:**
- Modify/delete: `src/app/dev/rules-preview/page.tsx` (renders `StatBlock` at ≈145)
- Verify: `FighterPanel.tsx`, `FightStage.tsx` local panel (≈307-333), `Reveal.tsx`, roster, leaderboard, fighter detail

- [ ] **Step 1: Repurpose `dev/rules-preview`** to render two worst-case fighters' new cards side by side at 375 and 1280 (it already frames the responsive check at ≈10-20), or delete it and its route if the fighter detail page covers it.

- [ ] **Step 2: Sweep render sites.** Confirm `FighterPanel.tsx`, `FightStage.tsx`'s local panel, and `Reveal.tsx` inherit the new `StatBlock` correctly (they consume it — verify visually). Roster/leaderboard (name/sprite/W-L only) are unaffected.

- [ ] **Step 3: Existing-fighter behaviour (expected).** Every pre-existing / seeded / ghost fighter has no `marquee`, so its card shows no Special (its background rules still fire and narrate in the log). This is per design. If a barer card for old fighters is unacceptable, add a one-line fallback in `cardModel` (`fighter.rules?.[0]` when none is `marquee`) — **only if the product owner wants it**; otherwise leave.

- [ ] **Step 4: Full responsive pass** at 375/1280 on: fighter detail, versus preview, choose screen, and an in-progress fight (arena side panels). Assert no horizontal overflow on each.

- [ ] **Step 5: Full regression.** `npx tsc --noEmit && npx vitest run` → all green (143 existing + new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: repurpose card preview; responsive + regression pass"
```

---

## Self-Review (completed by plan author, post-adversarial-review)

**Spec coverage:** face (Tasks 1, 3, 4) · engine untouched (Global Constraints + Task 2 scope) · pick-a-Special incl. 0/1/2 (Tasks 5, 6) · surprise (no task — solo already satisfied) · absolutes-in-code (Task 2) · reading-fun/names incl. named Spirit peak (Tasks 1, 3) · log narration (no task — already true) · trust boundary / signing (Tasks 5, 6) · dedup (Task 6). All covered.

**Adversarial findings folded in:** (1) absolutes moved from prompt-flag to code heuristic on action+trigger [Task 2]; (2) 0/1/2 Specials handled — skip choose on 0 [Tasks 5, 6, 8]; (3) background = full honored set, dedup on assemble [Tasks 5, 6]; (4) Special = single rule, invuln claim narrowed to "attacks" [spec §5/Goal 5]; (5) choose-screen mechanic-distinctness required in prompt + telegraphed in card copy [Tasks 5, 9]; (6) pressure meters — surfaced as a user decision [spec risks]; (7) Spirit bar labeled with peak name [Task 1]; (8a) client-supplied rules closed via HMAC signing [Tasks 5, 6]; (8b) persist re-derives all fields / never spreads candidate [Task 6.6]; (8c) rate limit on the generate endpoint [Task 6.5]; (8d) `.tsx` test replaced with pure `cardModel`/helper `.ts` tests [Task 3]; (8e) reversed `CompareRow` refs + `sessionId` in `createFighter` + `generateCandidates` naming corrected [Tasks 4, 6].

**Placeholder scan:** none. UI tasks (4, 6, 7) that touch files not fully quoted carry explicit "read first" steps + exact target lines + real snippets for all new modules.

**Type consistency:** `FaceBar`, `CardModel`, `Special`, `Rule.marquee`, `faceBars`, `cardModel`, `normalizeSpecials`, `signCandidate`/`verifyCandidate`, `assembleRules`, `generateCandidates`/`createFighter` are used identically across tasks.

**Open decisions for the product owner (see spec risks):** pressure meters in the fight view (kept, or simplify?); barer cards for pre-existing fighters (leave, or backfill `rules[0]`?); surprise is solo-only (bracket fights stay deterministic).
