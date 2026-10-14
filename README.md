# prompt fighter

Describe a fighter in four 80-character prompts. A model turns it into stats,
moves, a flaw and a 16×16 sprite, and it fights someone else's.

## The loop

1. **Build** — four slots: Body, Weapon, Signature move, Flaw.
2. **Generate** — one Claude call returns a character sheet and a sprite as
   structured output.
3. **Fight** — you're matched against a ghost: a fighter someone else built.
   The fight resolves on the server; the client replays the turn log.
4. **Lose, edit, die** — a fighter has three lives. Losing a fight you started
   costs one and banks an edit: change one slot and the fighter is regenerated
   as its next version, same name. The third loss kills it. Ghosts never lose
   lives — nobody dies while their owner is away.
   - **Killcam** — lose, and you see the four prompts that beat you.
   - **Obituary** — a dead fighter's prompts go public on its page, with a
     share link whose preview shows the sprite.
5. **Rank** — both fighters' records and Elo move. The leaderboard ranks by Elo.

**Rooms**: share a four-character code, everyone enters a fighter, and a
bracket plays out on everyone's screen at once. **Favorites**: everyone gets one
vote to give to someone else's fighter; votes feed that fighter's crowd meter.

## Design rules

- **Stat budgets are the anti-cheat.** Body stats (`hp atk def spd`) total 30;
  spirit stats (`cha wil arc luk`) total 20. Neither can borrow from the other,
  and both are re-normalized server-side after the model returns. "Invincible"
  gets a lopsided spread, not more points.
- **Mechanics come from a fixed enum.** Move effects (`damage heavy heal guard
  drain stun`) and flaws (`glass slow_start stamina wild overheat`) are chosen,
  never invented, so no prompt can produce "instantly wins".
- **Fights are deterministic.** `simulate(a, b, seed)` over a seeded PRNG, so
  any fight can be replayed exactly. New randomness salts the seed and gets its
  own generator — an extra draw from the sim's stream would rewrite history.
- **Two ways to win.** Knock the opponent out, or cap one of three pressure
  meters (crowd / hex / fate), pushed by `cha` / `arc` / `luk` and resisted as
  a fraction by `wil`. The victory label (KO, ring-out, lapsed paperwork…) is
  derived after the fight and never changes who won. `npm run pressure`
  measures how often each happens.
- **Favorites saturate.** The crowd boost is `1 + 0.5 · n/(n+12)`, applies only
  to the crowd meter, and is zero for a fighter with no Presence. A vote is
  keyed on both the session and the hashed client IP, and you can't vote for
  your own fighter.
- **Only server-matched fights move the ranking.** In a room the caller picks
  both sides, so bracket results never touch records or Elo.
- **Rooms poll instead of using a socket.** Each match is simulated in full when
  it starts and stamped with `starts_at`; every viewer derives the current beat
  from the clock. The first poller past a match's end claims the next one with a
  conditional `UPDATE … where starts_at is null`, so no host or lock is needed.
- **The browser holds no credentials.** It only calls same-origin `/api/*`.
  Supabase is reached with the service role from route handlers; every table
  has RLS on with no policies. `session_id` is the only credential and is never
  serialised — see `lib/server/fighters.ts`.

## Stack

Next.js App Router on Vercel, inline styles, no component libraries. Supabase as
plain Postgres. Anthropic SDK for generation.

```
src/app/api/          create-fighter, fight, fighter(s), favorite, leaderboard, room/*
src/lib/engine/       types, rng, sim, victory, narration, validation, generation prompt, bracket
src/lib/server/       service-role client, Anthropic call, client-key hashing, row projection
src/components/       sprite canvas, stat block, fight stage
src/screens/          builder, reveal, arena, lobby, bracket, broadcast
supabase/migrations/  schema, grants, spirit backfill, brackets, favorites, limits + Elo, lives
tests/                sim, victory, bracket, favorites, validation, projection
```

## Setup

```bash
npm install
cp .env.example .env.local
```

| Variable | |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` (secret) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GENERATIONS_PER_DAY` | Optional. Global cap on model calls per 24h (default 500). |

None are `NEXT_PUBLIC_`. Apply the migrations in order:

```bash
supabase link --project-ref <ref> && supabase db push
```

or paste each file from `supabase/migrations/` into the SQL editor. Every
migration grants `service_role` explicitly — it bypasses RLS but not table
privileges, and without the grants every route fails with `42501`.

Then fill the ghost pool:

```bash
npm run dev
npm run seed     # second terminal; SEED_BASE_URL points it at a deployment
```

If `supabase link` says `Unauthorized` right after `supabase login`, unset any
stale `SUPABASE_ACCESS_TOKEN` — the CLI prefers it.

## Commands

| | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (stop `dev` first — they share `.next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run seed` | Generate the starter pool |
| `npm run pressure` | Measure pressure-victory rates |

## Notes

- Identity is an anonymous UUID in `localStorage`. Clearing it orphans your
  fighters.
- Generation is rate-limited per attempt (refused prompts count): 10/hour per
  session, 30/hour per client IP, `GENERATIONS_PER_DAY` overall. Edits share
  the same budget.
- Unsafe prompts are caught by a `safe` flag in the generation output and never
  enter the pool.
- `create-fighter` has `maxDuration = 60`; generation runs at `effort: 'low'`
  to stay inside it.
- A daily Vercel cron hits `/api/leaderboard` so the free Supabase project
  doesn't pause.
