# prompt fight

An anonymous SPA where you build a fighter out of four character-capped prompts,
the app generates a low-resolution sprite for it, and it fights someone else's.

## The loop

1. **Build** — four labeled slots, 80 characters each: Body, Weapon, Signature
   move, Flaw.
2. **Generate** — one Claude Opus 5 call turns the prompts into hidden stats,
   two named moves, a flaw effect, and a 16×16 sprite.
3. **Match** — you're paired against a ghost: a fighter a real person built
   earlier. No waiting, no empty lobby.
4. **Fight** — the sim resolves server-side and returns a turn log; the client
   replays it round by round.
5. **Persist** — your fighter keeps its record and joins the pool for others.

## Why it's shaped this way

**The stat budget is the anti-cheat.** Prompts become four stats that must sum
to exactly 30. A fighter described as invincible gets a lopsided spread, not
extra points.

**Move effects come from a fixed enum** (`damage`, `heavy`, `heal`, `guard`,
`drain`, `stun`; flaws: `glass`, `slow_start`, `stamina`, `wild`, `overheat`).
The model picks from a vocabulary the engine already implements — it can't
invent a mechanic, so it can't invent "instantly wins". Both properties are
enforced in the JSON schema *and* re-normalized server-side, because a schema
can express an enum but not "these four numbers must total 30".

**Fights resolve on the server.** The client receives a turn log and animates
it; it never computes a result. Records stay honest, and because the sim is
`simulate(a, b, seed)` over a seeded PRNG, any fight can be re-derived exactly.

**Narration is templated.** The creative work already happened upstream — the
model named the fighter and its moves — so stitching those names into a verb
reads well and costs nothing per fight.

**The browser holds no credentials.** Every call is same-origin to `/api/*`;
Supabase and Anthropic are only ever reached from route handlers. There is no
publishable key in the bundle and no CORS layer to maintain.

## Stack

Next.js App Router on Vercel, mobile-first, inline styles, no component
libraries. Supabase is just Postgres — reached exclusively through the service
role from route handlers.

```
src/app/                    layout, the single client page, and the API routes
src/app/api/create-fighter/ prompts → schema-enforced generation → row
src/app/api/fight/          pick ghost → simulate → record → turn log
src/app/api/fighter/[id]/   returning-player lookup
src/lib/engine/             types, RNG, sim, narration, validation, prompt
src/lib/server/             service-role client, Anthropic call
src/components, src/screens sprite canvas, builder, reveal, arena
supabase/migrations/        schema, RLS, pick_ghost + record_result
tests/                      sim determinism/termination, normalizers
```

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the three values below
```

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` (secret) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |

All three are server-only — none are `NEXT_PUBLIC_`, so none reach the browser.

Apply the schema (either works):

```bash
supabase link --project-ref <ref> && supabase db push
# or paste supabase/migrations/0001_init.sql into the dashboard SQL editor
```

Then fill the ghost pool and run it:

```bash
npm run dev
npm run seed     # in a second terminal, with the dev server up
```

If `supabase link` returns `Unauthorized` straight after a successful
`supabase login`, check for a `SUPABASE_ACCESS_TOKEN` environment variable — the
CLI prefers it over stored credentials, so a stale one shadows every login.

## Deploying

Import the repo at vercel.com; Next is detected automatically. Set the same
three environment variables in the Vercel project, then deploy. To seed the
live pool, point the seed script at it:

```bash
SEED_BASE_URL=https://your-app.vercel.app npm run seed
```

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Sim and validation tests |
| `npm run seed` | Generate the starter fighters for the pool |

## Notes

- Identity is an anonymous UUID in `localStorage`. Clearing storage orphans your
  fighter — that's the tradeoff for having no accounts.
- Rate limit is 10 fighters per session per hour. One model call per fighter
  created, none per fight.
- Unsafe prompts are caught by a `safe` flag on the generation call and bounce
  before anything is written, so they never enter the pool.
- `create-fighter` sets `maxDuration = 60`. Generation is the slowest thing in
  the app; if it starts timing out, drop `effort` from `medium` to `low` in
  `src/lib/server/generate.ts`.
