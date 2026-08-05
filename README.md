# prompt fighter

An anonymous SPA where you build a fighter out of four character-capped prompts,
the app generates a low-resolution sprite for it, and it fights someone else's.

## The loop

1. **Build** — four labeled slots, 80 characters each: Body, Weapon, Signature
   move, Flaw.
2. **Generate** — one Claude Sonnet 5 call turns the prompts into hidden stats,
   two named moves, a flaw effect, and a 16×16 sprite.
3. **Match** — you're paired against a ghost: a fighter a real person built
   earlier. No waiting, no empty lobby.
4. **Fight** — the sim resolves server-side and returns a turn log; the client
   replays it round by round.
5. **Persist** — your fighter keeps its record and joins the pool for others.

Or bring people: a room is a four-character code, everyone enters a fighter, and
the bracket plays out one match at a time on everyone's screen at once.

## Why it's shaped this way

**The stat budget is the anti-cheat.** Prompts become stats that must sum to a
fixed total. A fighter described as invincible gets a lopsided spread, not extra
points.

**There are two budgets, not one.** The body four (`hp`, `atk`, `def`, `spd`)
spend 30 points; the spirit four (`cha` Presence, `wil` Resolve, `arc`
Weirdness, `luk` Fate) spend 20. They are normalized separately and neither can
borrow from the other. One combined budget of 50 would have been simpler, and
wrong twice over: it would let a fighter cash in its entire personality for
attack power — collapsing the second axis back into the first — and it would
have silently restated every fighter already in the pool, because a spread that
totals 30 does not total 50. Two ceilings keep the physical balance exactly what
it was and make the spirit spread a real decision rather than a discount on
damage. Rows written before spirit existed read back as a flat 5/5/5/5, which is
on-budget and favours nobody; migration `0003` writes the same thing down, and
`hydrateFighter` applies it on every read so the panel a player looks at always
shows the numbers the fight was actually decided on.

**Move effects come from a fixed enum** (`damage`, `heavy`, `heal`, `guard`,
`drain`, `stun`; flaws: `glass`, `slow_start`, `stamina`, `wild`, `overheat`).
The model picks from a vocabulary the engine already implements — it can't
invent a mechanic, so it can't invent "instantly wins". Both properties are
enforced in the JSON schema *and* re-normalized server-side, because a schema
can express an enum, and a per-stat range, but not "these four numbers must
total exactly 30".

**Fights resolve on the server.** The client receives a turn log and animates
it; it never computes a result. Records stay honest, and because the sim is
`simulate(a, b, seed)` over a seeded PRNG, any fight can be re-derived exactly.

**Victory types are labels, not rules.** A fight can be won by knockout, but
also by overkill, ring-out, disqualification, self-destruct, lapsed paperwork,
or a falling lighting rig. `classifyVictory` runs *after* the sim loop, reads
only the final tallies, and never touches `winner` or `decision` — so a new
victory type can't change who won, and every seed still resolves the way it
always did. The two flavour rolls draw from their own RNG stream for the same
reason: taking from the sim's stream would shift every later roll and silently
rewrite history.

**Pressure is a second way to lose.** Three meters — crowd, hex, fate — fill
alongside HP, pushed by the winner's `cha`/`arc`/`luk` and slowed by the
opponent's `wil`. Cap one and the bout stops there, whatever the health bars
say, and the win is reported from that track's pool of victory types.

Only what a fighter spent *above* the floor pushes, so a track sitting on
`SPIRIT_MIN` accrues nothing at all, provably, whoever it is up against — "this
fight is purely physical" stays a property of the numbers rather than a special
case someone has to remember to maintain. Resistance, by contrast, is a
fraction rather than a subtraction, and that distinction is load-bearing.
Subtracting `wil` from the pusher's stat looked equivalent and wasn't: a fight
runs a fixed number of beats, so any deficit below a certain size could never
cap a meter *inside one*, which turned a large enough `wil` into absolute
immunity and switched the mechanic off for the bout. Half the spirit budget
bought a hard counter to a mechanic worth a large slice of outcomes. A fraction
can't do that — Resolve buys a great deal of time and never buys a wall, so
pushing harder always buys something back.

How often it fires, measured over 20k fights a population in
`scripts/pressure-rates.ts` (`npm run pressure`): roughly 35% on moderately
lopsided spirit lines and roughly 48% on strongly lopsided ones — against 45%
and 38% knockouts respectively — so a capped meter and a flattened opponent are
peers, which is the point. Between two fighters who both commit a track to the
ceiling it is the majority read, and it stays at zero for anyone who bought no
spirit at all.

That last clause is the whole design, and the first tuning missed it. The
constants were sized against the *maximum* fight length when most fights end on
health at about half of it, so meters typically stalled near a quarter of the
bar and the mechanic read as decorative. Worse, the fight-long mood draw was
bunched tightly enough that a given pair of spirit lines had a nearly
deterministic verdict — Presence 8 capped a meter 15% of the time and Presence 6
capped 3%, so anything short of all-in was playing a different game, and the
aggregate rate looked defensible throughout. The fix widened that draw as well
as raising the rates: one point of a spirit stat should move a rate, not flip a
switch. It is now 39% and 13%. `tests/victory.test.ts` guards the aggregate on
both distributions *and* the shape of the curve, because the aggregate alone
cannot tell those two mechanics apart.

One known cost, inherited rather than introduced: the fighters migration `0003`
backfilled with a flat 5/5/5/5 are middling pushers and middling defenders at
once, so they take considerably more pressure losses than they score, and
raising the mechanic's share raised that too — their overall win rate against
random opponents moves from about 49% to about 40%. The fix if it matters is the
one `0003` already names: derive a deterministic spirit spread from those
fighters' stored prompts, rather than nudge these constants back down and switch
the mechanic off again for everyone.

**New randomness gets its own stream.** This is the rule that makes any of the
above safe to add. The pressure jitter draws from `makeRng(seed ^
PRESSURE_SALT)` and the victory flavour rolls from streams of their own, never
from the sim's `rng`. A single extra draw inside the resolution loop would shift
every roll after it, which does not fail a test — it silently rewrites every
fight that has already happened, including the ones sitting in `matches.log`
with a winner already recorded against them. Anything new that needs a random
number salts the fight seed and makes its own generator.

**Narration is templated.** The creative work already happened upstream — the
model named the fighter and its moves — so stitching those names into a verb
reads well and costs nothing per fight.

**The browser holds no credentials.** Every call is same-origin to `/api/*`;
Supabase and Anthropic are only ever reached from route handlers. There is no
publishable key in the bundle and no CORS layer to maintain.

**Bracket mode polls a clock instead of opening a socket.** Several people join
a room with a four-character code and watch one bracket together. The obvious
implementation is Supabase Realtime, and it is the wrong one here: subscribing
from the browser means shipping an anon key to the browser, which trades away
the property directly above for a feature that does not need it.

It does not need it because fights are deterministic and resolve instantly. The
server simulates a whole match the moment it starts and stamps it with
`starts_at`, so every viewer already holds the entire turn log before the first
beat is drawn. From there the current beat is arithmetic —
`floor((serverNow - startsAt) / BEAT_MS)` — against an offset each client
samples once from `server_now`. Identical log plus identical timestamp plus
identical arithmetic means synchronized viewers without a push channel, and
somebody who opens the link forty seconds late drops into the middle of the
round rather than starting it over. The poll every 1.5s exists only to learn
that one match ended and the next began; it carries no per-frame traffic.

**Advancing the bracket is a conditional UPDATE, not a leader.** The polling GET
is what moves the tournament forward: the first poller past a match's `ends_at`
claims the next one with `update ... where code/round/slot and starts_at is
null`. Exactly one caller matches that WHERE and simulates; everyone else
affects zero rows and reads what the winner wrote. No locks, no cron, and no
dependence on the host keeping their tab open. The whole tree — later rounds as
empty rows — is written up front by `/start`, which is what lets advancing be an
update into a row that already exists rather than an insert that could race.
`/start` treats a primary-key collision on that insert as "the tree is already
there" and carries on rather than refusing, so a request that died between the
two writes leaves a room that the next Start recovers instead of one bricked in
the lobby forever.

**Bracket results don't touch the public record.** `/api/fight` is safe to rank
on because `pick_ghost` picks the opponent — a fighter's record is bounded by
how it actually does against a field it didn't choose. A room is the opposite:
the caller picks both sides. Seating your best fighter against one you built to
lose is a guaranteed win, repeatable for the cost of four HTTP requests and no
model call at all. So `_advance.ts` deliberately calls no `record_result`, and
the leaderboard only moves on fights the server matched. Bracket mode's prize is
the champion card.

## Stack

Next.js App Router on Vercel, mobile-first, inline styles, no component
libraries. Supabase is just Postgres — reached exclusively through the service
role from route handlers.

```
src/app/                    layout, the client pages, and the API routes
src/app/api/create-fighter/ prompts → schema-enforced generation → row
src/app/api/fight/          pick ghost → simulate → record → turn log
src/app/api/fighter/[id]/   returning-player lookup
src/app/api/room/           create, join, start, and the polling GET
src/app/api/room/_advance   claim-and-simulate; drives the bracket forward
src/app/room/[code]/        the shareable room URL
src/lib/engine/             types, RNG, sim, narration, victory, validation, prompt
src/lib/engine/bracket.ts   room codes, seeding, pairings, timing constants
src/lib/server/             service-role client, Anthropic call
src/components/             sprite canvas, stat block, fight stage
src/screens/                builder, reveal, arena, lobby, bracket, broadcast
supabase/migrations/        schema, RLS, grants, spirit backfill, bracket tables
tests/                      sim determinism/termination, victory, bracket, normalizers
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
# or paste each file in supabase/migrations/ into the dashboard SQL editor,
# in filename order — 0002 is what makes the service role actually work
```

All four matter, in order. `0001` creates the fighters table with RLS on and no
policies; `0002` grants the service role the privileges it needs; `0003`
backfills the spirit stats onto existing fighters; `0004` adds the bracket
tables (`rooms`, `room_entrants`, `matches`), again with RLS on and no policies.

`0002` is the one worth understanding. The service role bypasses RLS but *not*
table privileges, and Supabase's default privileges only fire for objects
created by `postgres` — so applying `0001` alone via the CLI, the MCP server, or
CI leaves every route handler failing with `42501 permission denied`. Pasting
into the dashboard happens to work, which is what makes this one confusing to
debug. The rule that follows from it: **every new table gets an explicit `grant`
to `service_role` in the same migration that creates it, and every new function
gets a `grant execute` plus a `revoke execute ... from public`.** `0004` grants
all three of its tables directly and adds no functions at all — the conditional
UPDATE that claims a match does the whole job, so there is nothing to revoke.
`0003` is a data-only backfill and adds neither.

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
  the app, and already runs at `effort: 'low'`. If it starts timing out, the
  next lever is the model in `src/lib/server/generate.ts` — but note Haiku 4.5
  rejects the `effort` parameter outright, so that swap is not one line.
- Generation costs roughly half a cent per fighter on Sonnet 5. The system
  prompt carries a cache breakpoint, which pays inside a play session but not
  across a quiet one — the default TTL is five minutes.
