# prompt fighter — working notes

Rules that aren't obvious from reading the code. Everything here was learned by
getting it wrong once.

## The site must be responsive

**Every screen has to work at 375px and at 1280px.** Mobile-first is not a
preference here — it's the only way most people will open a link someone sends
them.

- **Verify both widths in a browser before saying a UI change is done.** Not
  "it should reflow" — resize and look. A layout that overflows on a phone looks
  fine in code review and broken to the person you shared it with.
- **`document.documentElement.scrollWidth` must equal `clientWidth`.** Any
  horizontal overflow is a bug. Grid children default to `min-width: auto`, so a
  long word or an un-wrapped label silently pushes a track wider than the
  viewport — set `min-width: 0` on grid children that hold text.
- **Inline styles can't express media queries.** Anything width-dependent goes
  in `globals.css` as a class; the component picks the class. That's why `.shell`
  / `.shell--wide` / `.arena` exist.
- **Absolutely-positioned overlays need an edge check.** A tooltip or popover
  anchored `left: 0` runs off-screen when its trigger is right-aligned. Decide
  the side from the trigger's rect (see `components/Hint.tsx`).
- **`position: sticky` on a grid item does nothing.** A sticky item can only
  travel within its own grid area, and with auto rows that area is exactly the
  item's height. The arena is `display: block` on a phone for precisely this
  reason — the battlefield needs the whole column to stick within.
- **`position: sticky` on a bar with nothing below it also does nothing.** It
  only engages once there's something to scroll past. If a bar must sit at the
  bottom of a short screen, it wants `fixed` plus reserved padding.
- **A sticky header stops sticking if `body` has `height: 100%`.** That caps the
  body box at one viewport, and the header's containing block goes with it. Use
  `min-height`.
- Test the *narrow* case by making panels stack, not by shrinking type. 13px is
  the floor.

## Never serialise `session_id`

It is the only credential this app has. `/api/fight` authorises a bout by
matching it against `fighterId`, so anyone holding another player's can fight
with their fighter and move its record.

Every fighter row leaves through the projection in `lib/server/fighters.ts` —
`PUBLIC_FIGHTER_COLUMNS` for selects, `toPublicFighter()` for rows that come
back from an RPC. **Never `select('*')` on `fighters` in a route that returns
the row.** `pick_ghost` returns every column, which is exactly how this got
shipped once already.

## Don't run `npm run build` while `next dev` is running

They share `.next`. Building against a live dev server corrupts it — the build
fails with `Cannot find module './xxx.js'` *and* the dev server starts throwing
500s. Stop dev, `rm -rf .next`, then build.

## The schema is the anti-cheat, not the model

Stats must total exactly 30 and effects come from a fixed enum. Both are
re-normalized server-side in `engine/validate.ts` after the model returns,
because a JSON schema can express an enum but not "these four numbers sum to
30". A weaker model returning an illegal spread is fine — it gets corrected.
Don't move that logic into the prompt.

## Rules are deliberately *not* budgeted

`engine/rules.ts` is the exception to everything above, and it is on purpose.
A fighter carries up to six `when → then` sentences drawn from a fixed
vocabulary, and there is no point budget on them at all. If a player writes
"invulnerable" they get `when_i_am_hit → immune` — a real, absolute, unfair
immunity. Do not add a cost, a cap, or a balance pass. Being told no is the
failure mode this system exists to remove.

The stat budgets stay because a stat line is permanent and moves a W/L record.
Rules are loose because the whole point is that the player gets the fighter they
described. Yes, this means someone can build a fighter that always wins, and
yes, they will climb the leaderboard. That is a known and accepted consequence,
not a bug to fix.

**The one invariant is that a fight ends.** Everything in `rules.ts` is written
to hold that: rules fire only from sim hooks so nothing cascades, no action
touches the round counter, and every action is clamped and total. `MAX_ACTIONS_
PER_SIDE` in `sim.ts` is the absolute ceiling and nothing a rule does can reach
it. Two immortal fighters go the distance and win on the decision.
`tests/rules.test.ts` asserts this against every trigger × action pair and
against randomly generated six-rule fighters; if you add a trigger or an action,
that test is the one that has to keep passing.

Two mechanical traps worth knowing:

- **Rules draw from their own RNG stream** (`RULES_SALT`), same reasoning as
  pressure's. A fighter with rules must not shift a single physical roll for the
  fighter without them — that's what keeps every fight already on record
  reproducible, and there's a test pinning it.
- **`TurnEvent.rules` is what the UI renders, not `TurnEvent.text`.** Nothing
  renders `text` today. If you add narration and can't see it, that's why.

Rules make generation meaningfully harder than picking from an enum — the model
has to compose, not classify. This raises the floor on model tier; don't assume
a cheaper one still produces coherent rules without looking at the output.

## Model and cost

Generation is one Sonnet 5 call per fighter, `effort: 'low'`. (This note used to
say Opus 5 at ~$0.011 warm / ~$0.026 cold; `server/generate.ts` moved to Sonnet 5
and the note didn't follow. Don't trust either figure without re-measuring.)
`effort` is **rejected outright by Haiku 4.5** — dropping to a cheaper tier means
removing the parameter, not just changing the id. See `/dev/model-comparison` for
measured quality and cost per model.

Cost facts worth keeping straight, because three of them are counter-intuitive:

- **The system prompt is billed on nearly every call, at 1.25×.** It carries a
  `cache_control: ephemeral` breakpoint, which is a *5-minute* TTL — so a cache
  write costs 1.25× and a read costs 0.1×. Break-even is two generations inside
  five minutes. A room filling up or a `seed` run clears that easily; one person
  making one fighter never does and pays the 1.25× premium every time. Keep the
  breakpoint (the burst cases are the expensive ones), but treat every token
  added to `SYSTEM_PROMPT` as a token billed at 1.25× on most calls.
- **The response schema is not covered by that breakpoint.** `FIGHTER_SCHEMA`
  rides in `output_config.format`, outside the tools → system → messages prefix,
  so it is billed at full input price on every single call. Anything explained in
  both the schema `description` fields and the system prompt is paid for twice,
  forever — keep schema descriptions terse and let the prompt do the teaching.
- **Sonnet 5's introductory pricing ends 2026-08-31.** $2/$10 per MTok becomes
  $3/$15 — a 50% rise with no code change. Re-measure after that date rather than
  assuming a regression.
- **Thinking is on by default on Sonnet 5.** Omitting the `thinking` parameter
  runs adaptive thinking; on Sonnet 4.6 the same omission meant no thinking at
  all. `generate.ts` omits it, so generation is paying for thinking tokens.
  `thinking: { type: 'disabled' }` is the single largest remaining lever on
  output cost — measure the sprite and rule quality before taking it.

## Conventions

- Inline styles, no component libraries. Colours and shared bits come from
  `theme.ts` — don't hardcode hex.
- Server-only env vars. Nothing is `NEXT_PUBLIC_`; the browser only ever talks
  to `/api/*`.
- Ports: `next dev` often lands on 3001 because 3000 is taken. `SEED_BASE_URL`
  in `.env.local` may need overriding per run.
