# prompt fight

An anonymous SPA where two players build a fighter out of a handful of
character-capped prompts, the app generates a low-resolution sprite for each,
and the fighters battle.

## Shape

- **Build** — four labeled slots, 80 chars each: Body, Weapon, Signature move, Flaw.
- **Generate** — one model call turns the prompts into hidden stats, two named
  moves, a flaw effect, and a 16×16 sprite.
- **Match** — you're paired against a ghost: a fighter a real person built earlier.
- **Fight** — the sim resolves server-side and returns a turn log; the client
  replays it round by round.
- **Persist** — your fighter keeps its record and joins the pool for others to fight.

## Stack

Vite + React + TypeScript, mobile-first, no component libraries. Supabase for
Postgres and Edge Functions — the functions hold the API key and own fight
resolution, so results can't be tampered with client-side.

## Status

Design in progress. Nothing implemented yet.
