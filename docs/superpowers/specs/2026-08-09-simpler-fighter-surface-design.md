# Simpler fighter surface, freedom kept underneath — design

**Date:** 2026-08-09
**Branch / PR:** `claude/custom-fight-modifiers-ry6tse` (PR #6)
**Status:** Approved design, pending implementation plan.

## The one-line

Make a fighter read in a glance — four plain bars and a few made-up names — while the
engine underneath still honors almost anything the prompt asked for, and no two runs
feel the same.

## Problem

The game surfaces too much. A single fighter today shows eight stats across two budgets
(Vitality/Attack/Defense/Speed + Presence/Resolve/Weirdness/Fate), two moves with power
numbers and effect tags, a flaw, three pressure meters, a signature charge meter — and,
as of PR #6, up to six rules rendered as numeric sentences ("Whenever a hit lands on
them, they take 2× damage"). That is a wall of numbers to read.

PR #6 ("Let a fighter be whatever the player described") built the right *engine* — a
combinatorial `when → then` rules system that lets an arbitrary prompt land on real,
honored mechanics — but it surfaced that engine as a stats wall, in direct tension with
the product's own direction (see commit `cacae29`, "Hide fighter stats during the fight,
behind a tap on the name"). The engine is the asset; the surfacing is the mistake.

## Goals

1. **A card you read in a glance** — four abstracted bars plus character names, no stat wall.
2. **Keep honor-anything** — the prompt's powers are real and stay in the engine, in full.
3. **A creation agency moment** — the player picks 1 of 3 candidate "Specials" at creation.
4. **Surprise** — the same prompt can yield different fighters; the same matchup fights
   differently each time (upsets happen; the stronger fighter usually, not always, wins).
5. **Absolutes stay absolute** — "invulnerable" produces *total, permanent* immunity **to
   attacks**, never a hedged "negates the first 3 hits" version. (Scope limit: it does not
   shield against non-attack loss paths — a `win_now`, a pressure-meter cap, or
   `hurt_them`/`steal_hp`. "Invulnerable" means "can't be hit," not "cannot lose.")
6. **Keep the reading fun** — the delight of made-up move and power names is preserved;
   only the *numbers* are hidden.

## Non-goals (parked, not lost)

- In-fight interactivity. The fight is watch-only; steering can be added later.
- Collapsing the four intake slots into one prompt box.
- Any budget, cap, or balance pass on a Special's magnitude — honor-anything is deliberate
  (see CLAUDE.md, "Rules are deliberately *not* budgeted").
- Rebalancing the sim's mechanics. This redesign never touches how a fight is computed.

## Design

### 1. The card (the face)

Show, and nothing more:

- Name, sprite, W–L record.
- **Four bars**, each scaled to its own ceiling:
  | Bar | Backed by | 
  |---|---|
  | Power | `stats.atk` |
  | Speed | `stats.spd` |
  | Toughness | `stats.hp` + `stats.def` |
  | Spirit | `max(cha, wil, arc, luk)` for the bar height, **labeled with the name of that peak stat** (Presence / Resolve / Weirdness / Fate). *Not* the sum — the spirit four spend a fixed 20-point budget, so their sum is constant and conveys nothing; the peak, and *which* dimension it is, varies and hands the player one more made-up word to read. |
- **Basic and Signature moves, by name only** (a short flavor clause if one reads well) —
  no `power`/`effect` readout.
- **The chosen Special** — its name and one flavor line, no numbers.
- **The flaw**, by name.

Comes off the card entirely: the raw eight stats, move power/effect, and any numeric rule
description. (Pressure meters are *not* on the card today — they live in the live-fight view
and stay there; they explain pressure wins. Out of scope for the card rework.)

The four-bar mapping is **display-only** — a presentation aggregation over the raw stats.
The sim still reads the eight underlying stats unchanged. The Spirit bar is intentionally
lossy (a Presence-heavy fighter and a Fate-heavy one can read the same); that is acceptable
and is the point of a glanceable face.

### 2. The engine (unchanged)

No mechanical change to `sim.ts`, `victory.ts`, the pressure math, the `rules.ts`
interpreter, or `favorites.ts`. Fights stay fair against AFK "ghost" opponents and remain
reproducible *given a seed* (the existing tests keep passing verbatim). Every change in this
redesign is either hiding something, choosing something, or narrating something — never
re-balancing.

### 3. Creation — pick the Special

1. Player fills the existing four prompt slots.
2. Generation returns three things: the fighter (stats / moves / flaw / sprite); a set of
   **background honored behaviors** — the incidental powers the prompt implies, which the
   fighter always gets; and **three candidate Specials** — three honest reads of the
   *standout* idea in the prompt, each a named power (name + flavor) backed by a rule (or a
   small coherent bundle) from the fixed vocabulary.
3. The player is shown the three Specials and picks one. The fighter's final rule set =
   the background behaviors **plus** the picked Special; the two unpicked candidates are
   discarded. The picked Special is the one named on the card; the background behaviors run
   silently and reveal themselves in the log when they fire.
4. The fighter is persisted (`rules` jsonb, capped at ≤ 6, per migration 0006).

Rules for the split, to avoid re-narrowing the honored set or presenting an empty/arbitrary
choice:

- **Background = everything the prompt implies *except* the one standout read.** Generation
  must not pour the fighter's real mechanics into the discarded candidates — the base rules
  carry the full honored behaviour; the three Specials are three *reads of the single
  standout idea*, not three separate powers.
- **The three candidates must differ in mechanic** (e.g. one `immune`, one `reflect`, one
  `revive`), so the pick is a real choice and each card's flavor line can telegraph the
  difference without numbers.
- **Zero is a valid, common outcome.** A plain prompt ("a big strong guy") has no standout
  idea; generation returns 0 Specials, the pick step is skipped, and the fighter simply has
  no marquee. 1–2 candidates are shown as-is. Persistence and the choose UI must be total
  over `length ∈ {0, 1, 2, 3}`.
- **Dedup on assembly:** if the chosen Special's rule is structurally equal to a background
  rule, drop the duplicate so effects never stack.

**Trust boundary:** generation is expensive and rules are deliberately unbounded, so the
persist path must not accept client-supplied rules. Sign the generated candidate + its
Specials server-side and verify on persist (or stash them server-side keyed by a generation
id); the client sends only *which* candidate it chose. Otherwise a crafted `fight_start →
win_now` could be POSTed straight past generation and the safety classifier to farm ranked
wins.

This is the honor-anything moment made visible: you choose which read of what you wrote your
fighter commits to.

### 4. The fight (watch-only, surprising)

- No in-fight input. You watch.
- **Surprise — already satisfied for solo fights.** The solo fight path
  (`src/app/api/fight/route.ts:69`) already draws a fresh crypto-random seed per fight, so
  the same two fighters play out differently every run. **No change needed.** Bracket/room
  fights (`src/app/api/room/_advance.ts`, via `matchSeed`) are deterministic **by design** —
  the race-free "any poller advances the bracket" scheme depends on every poller deriving the
  same seed and log — and must stay deterministic.
- **Powers announce themselves — already narrative.** When a rule fires, `fireRules`
  (`rules.ts:682`) already pushes `"${rule.name}: ${rule.text}"` into `TurnEvent.rules`, and
  the battle log prints it verbatim. The numeric `describeRule` is used *only* on the card and
  never reaches the log. So this is a *verify-and-keep*, not a build: just ensure `rule.text`
  reads as flavor.

### 5. Absolutes stay absolute

Enforced **in code, keyed on action + trigger** — not on a model-set flag or a prompt
instruction (CLAUDE.md: "the schema is the anti-cheat, not the model"). Rule: when the
honored action is the all-or-nothing `immune` fired from an *unconditional* trigger
(`when_i_am_hit`, `always`, `my_turn`, `fight_start`, `their_turn` — the "just is" triggers
with no threshold or condition), `normalizeRule` forces `chance = 100` and `times = 0`. So
"invulnerable" (`when_i_am_hit → immune`) always lands total and permanent, even if the
model hedged the numbers. A *deliberately conditional* immunity (`my_hp_below 30 → immune`)
keeps the model's numbers, because its trigger is a real condition — that is a designed
power, not an absolute.

This is deliberately scoped to `immune`. Other all-or-nothing actions (`win_now`,
`silence_them`) keep the model's chosen `chance`: a low-odds instant-win or silence is a
legitimate designed power, not something to force to 100%. And per the scope limit in Goal
5, `immune` only zeroes attack damage — it is not a shield against `win_now`, pressure, or
`hurt_them`/`steal_hp`.

### 6. Surprise in creation

The same prompt can yield noticeably different fighters and Specials across attempts, from
model sampling plus the three-candidate variety. Keep it lightweight — no dedicated re-roll
economy required for v1; the three candidates plus natural generation variance carry it.

## What this does to PR #6

The PR becomes the *substrate*, not the merge-as-is.

- **Keep:** `lib/engine/rules.ts` (the interpreter and vocabulary), the sim wiring, 
  `tests/rules.test.ts`, migration `0006`, and rule generation.
- **Cut:** the numeric `describeRule` rows in the card (`StatBlock.tsx`); the
  `/dev/rules-preview` stress page (or repurpose it to preview the new card).
- **Already true (verify, don't build):** battle-log rule lines are *already* narrative
  (`fireRules`, `rules.ts:682`, prints `name: text`, not `describeRule`). Fresh-seed-per-fight
  is *already* the solo path's behaviour (`fight/route.ts:69`). Neither needs new work.
- **Add:** the four-bar face + move/Special/flaw *names* on the card; the three-candidate
  Special creation step (split generate-vs-persist); the absolutes-stay-absolute normalization.

## Risks & open questions (to resolve in the plan)

- **Generation:** producing three genuinely distinct, coherent Specials in one call, and its
  cost impact (one call, modest extra output — measure). Schema shape for candidates + which
  is chosen.
- **Data model:** how the chosen Special is marked versus the background rules — a
  dedicated field on the fighter, or a convention (e.g. rules[0] is the marquee)?
- **Background-vs-Special split:** how much of the prompt is auto-honored as background
  versus offered as the three-way Special choice. v1 candidate: the single standout idea →
  three Specials; everything else → background. Pin the split in the plan.
- **Absolutes — resolved:** enforced in code by action + trigger (see §5), not by a model
  flag; no fuzzy prompt parsing.
- **Persist trust boundary — resolved in plan:** sign or server-stash the generated
  candidate; the client cannot inject rules (see §3 trust boundary).
- **Existing fighters lose card rule info:** every fighter created before this change (and
  every seeded/ghost fighter) has no marquee, so its new card shows no Special — its
  background rules still fire and narrate in the log, but the card is barer than before.
  Decide: leave as-is (acceptable per design) or backfill a marquee from `rules[0]`.
- **Surprise is solo-scoped:** only solo `/api/fight` fights vary run-to-run; bracket/room
  fights stay deterministic by design. Confirm this matches the "surprise each time" intent.
- **Pressure meters kept:** the user named pressure meters as clutter, but they live in the
  live-fight view (not the card) and explain pressure wins; this design leaves them. Confirm
  with the user whether the fight view should simplify too, or keep them.
- **Test harness:** the repo's vitest only discovers `tests/**/*.test.ts` with no JSX
  transform, so card assertions go through a pure `cardModel(fighter)` helper, not a rendered
  component.
- **Fight seed:** confirm the current seed source; ensure fresh-per-fight doesn't conflict
  with any stored-result or ranked-integrity assumptions.
- **"Honor most" boundary:** prompts with no mechanical hook in a 1v1 HP fight ("turns the
  arena into soup") get mapped to the nearest effect or dropped. Set expectations in UI copy.
- **Spirit-bar lossiness:** acceptable, but noted.
- **Naming collision:** the generation schema already has a field `special` = the *signature
  move* (`generation.ts:116`, mapped to `moves[1]`). The redesign's "Special" is a different
  concept — the chosen marquee power. Name the new field distinctly (`specials` /
  `marquee`) so the two are never conflated.

## Testing

- All existing tests stay green (the engine is untouched) — this is a hard gate.
- New coverage:
  - The four-bar display aggregation (pure function; Power/Speed/Toughness/Spirit from raw stats).
  - Absolutes normalization: an absolute-intent `immune` normalizes to `chance 100`, `times 0`.
  - Generation returns three well-formed candidate Specials (schema/validate level).
  - The card renders names, not numbers (no stat wall; no `describeRule` numeric output).
  - Responsive card at 375px and 1280px — `document.documentElement.scrollWidth ===
    clientWidth` (per CLAUDE.md's responsiveness rule).
