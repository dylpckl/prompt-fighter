# prompt fight

An anonymous SPA where two players build a fighter out of a handful of
character-capped prompts, the app generates a low-resolution sprite for each,
and the fighters battle.

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
invent a mechanic, so it can't invent "instantly wins".

**Fights resolve on the server.** The client receives a turn log and animates
it; it never computes a result. Records stay honest, and because the sim is
`simulate(a, b, seed)` with a seeded PRNG, any fight can be re-derived exactly.

**Narration is templated.** The creative work already happened upstream — the
model named the fighter and its moves — so stitching those names into a verb
reads well and costs nothing per fight.

## Stack

Vite + React + TypeScript, mobile-first, no component libraries. Supabase for
Postgres and two Edge Functions. The Anthropic key lives only in function
secrets.

```
src/                             client — screens, sprite canvas, API calls
supabase/functions/_shared/      types, RNG, sim, narration, validation, prompt
supabase/functions/create-fighter/  prompts → schema-enforced generation → row
supabase/functions/fight/           pick ghost → simulate → record → turn log
supabase/migrations/             schema, RLS, pick_ghost + record_result
tests/                           sim determinism/termination, normalizers
```

## Setup

```bash
npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
```

Apply the schema and deploy the functions:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy create-fighter
supabase functions deploy fight
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions
automatically — only the Anthropic key needs setting.

If `supabase link` returns `Unauthorized` straight after a successful
`supabase login`, check for a `SUPABASE_ACCESS_TOKEN` environment variable: the
CLI prefers it over stored credentials, so a stale one shadows every login.

Fill the ghost pool, then run the app:

```bash
npm run seed
npm run dev
```

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build |
| `npm test` | Sim and validation tests |
| `npm run seed` | Generate the starter fighters for the pool |

## Notes

- Identity is an anonymous UUID in `localStorage`. Clearing storage orphans your
  fighter — that's the tradeoff for having no accounts.
- Rate limit is 10 fighters per session per hour. One model call per fighter
  created, none per fight.
- Unsafe prompts are caught by a `safe` flag on the generation call and bounce
  before anything is written, so they never enter the pool.
