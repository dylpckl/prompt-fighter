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

Body stats total exactly 30, spirit stats exactly 20, and effects come from a
fixed enum. All three are re-normalized server-side in `engine/validate.ts`
after the model returns, because a JSON schema can express an enum but not
"these four numbers sum to 30". A model returning an illegal spread is fine — it
gets corrected. Don't move that logic into the prompt.

## New randomness gets its own stream

The sim is `simulate(a, b, seed)`. One extra draw from the sim's `rng` shifts
every roll after it and silently rewrites every past fight — no test fails.
Anything new that needs randomness salts the seed and makes its own generator
(see `PRESSURE_SALT` in `engine/victory.ts`).

## Every migration grants `service_role` explicitly

The service role bypasses RLS but not table privileges, and Supabase's default
grants only fire for objects created by `postgres`. A new table needs a
`grant ... to service_role`; a new function needs `revoke execute ... from
public` plus `grant execute ... to service_role`. Miss it and every route gets
`42501 permission denied` — but only when applied via CLI/MCP, not the
dashboard, which is what makes it confusing.

## Model calls are rate-limited by attempt, not by fighter

`claim_generation` (migration 0006) records each attempt *before* the model
call, keyed on the hashed client address as well as the session, with a global
daily cap (`GENERATIONS_PER_DAY`). Counting inserted fighters by `session_id`
let anyone loop for free: the session is browser-invented, and refused prompts
never insert.

## Model and cost

Generation is one `claude-sonnet-5` call per fighter at `effort: 'low'` with
structured output ($2 / $10 per MTok). `effort` is **rejected outright by Haiku
4.5** — dropping to a cheaper tier means removing the parameter, not just
changing the id.

## Conventions

- Inline styles, no component libraries. Colours and shared bits come from
  `theme.ts` — don't hardcode hex.
- Server-only env vars. Nothing is `NEXT_PUBLIC_`; the browser only ever talks
  to `/api/*`.
- Ports: `next dev` often lands on 3001 because 3000 is taken. `SEED_BASE_URL`
  in `.env.local` may need overriding per run.
