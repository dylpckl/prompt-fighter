-- prompt fight — bracket mode.
--
-- Several people join a room with a 4-character code and watch fighters fight
-- one at a time, together, on the same page. There is deliberately no realtime
-- channel here: Supabase Realtime would mean shipping an anon key to the
-- browser, and the browser holding no credentials is the whole security story.
--
-- It isn't needed. Fights are deterministic and resolve instantly server-side,
-- so the server simulates a whole match the moment it starts and stamps it with
-- `starts_at`. Every viewer then derives the current beat from arithmetic:
--
--   beat = floor((serverNow - startsAt) / BEAT_MS)
--
-- Identical log + identical timestamp + identical arithmetic = frame-synced
-- viewers. Clients poll one GET every ~1.5s purely to learn that a match ended
-- and the next began.
--
-- Advancing the bracket is a conditional UPDATE from the route handler:
--
--   update matches set starts_at = ..., log = ... where ... and starts_at is null
--
-- The first poller past `ends_at` matches that WHERE, claims the row and
-- simulates; every other poller's update affects zero rows and they simply read
-- what the winner wrote. No locks, no leader election, and no dependence on the
-- host keeping their tab open. That is why there is no claim_next_match()
-- function below — a single conditional UPDATE already does the whole job, and
-- a function would only add a grant to get wrong.
--
-- Same access story as 0001: RLS on, zero policies, and explicit grants to
-- service_role. Without those grants every route handler dies with
-- `42501 permission denied` — the service role bypasses RLS but NOT table
-- privileges, and Supabase's default privileges only fire for objects created
-- by the `postgres` role. See 0002 for the long version.

create table public.rooms (
  code          text primary key,
  host_session  uuid not null,
  -- What the create-room rate limit counts. NOT `host_session`: that is a UUID
  -- the browser invents, so a limit keyed on it is a limit on politeness — a
  -- fresh UUID per request always counts zero. This is a salted hash of the
  -- forwarded client address, so it is something the caller does not choose and
  -- no raw address is stored. Best-effort by nature; see the route.
  host_key      text not null,
  status        text not null default 'lobby',
  -- Seats on offer. The bracket itself sizes to whoever actually turned up.
  size          integer not null default 8,
  -- Every match seed is derived from this, so a finished bracket replays.
  seed          bigint not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '3 hours',
  constraint rooms_status_check check (status in ('lobby', 'running', 'done')),
  constraint rooms_size_check check (size in (4, 8, 16))
);

create table public.room_entrants (
  code        text not null references public.rooms (code) on delete cascade,
  seat        integer not null,
  fighter_id  uuid not null references public.fighters (id),
  -- Kept so a viewer can be shown which entrant is theirs. Never sent to
  -- anyone else — the GET returns a boolean, not the id.
  session_id  uuid not null,
  joined_at   timestamptz not null default now(),
  primary key (code, seat),
  -- One entry per fighter. This is also what makes a double-click on Join a
  -- no-op rather than two seats.
  unique (code, fighter_id)
);

create table public.matches (
  code        text not null references public.rooms (code) on delete cascade,
  round       integer not null,
  slot        integer not null,
  -- Null until the feeding match resolves. Exactly one null in round one is a
  -- bye; both null means the round below hasn't finished yet.
  a_fighter   uuid,
  b_fighter   uuid,
  winner      uuid,
  seed        bigint,
  -- The full SimResult: log, winner, maxHp, decision, victory.
  log         jsonb,
  starts_at   timestamptz,
  ends_at     timestamptz,
  primary key (code, round, slot)
);

-- The polling GET reads the whole tree for one room in bracket order, which the
-- primary key already serves. What it doesn't serve is the advance cursor —
-- "the earliest match nobody has claimed" — so index exactly that, partially.
create index matches_unclaimed_idx on public.matches (code, round, slot)
  where starts_at is null;

-- Rooms are disposable; this is for whatever eventually sweeps them up.
create index rooms_expires_idx on public.rooms (expires_at);

-- Creating a room is an unauthenticated POST that writes a row, so the route
-- rate-limits per caller. Same shape as the fighters index that backs the
-- create-fighter limit, keyed on the one identifier the caller can't pick.
create index rooms_key_created_idx on public.rooms (host_key, created_at desc);

-- RLS on with no policies at all: anon and authenticated are denied outright.
-- The service role bypasses RLS, which is the only path that exists.
alter table public.rooms enable row level security;
alter table public.room_entrants enable row level security;
alter table public.matches enable row level security;

-- The grants that actually make the route handlers work.
--
-- `delete` is on rooms because `rooms_expires_idx` exists for a sweeper and a
-- sweeper without the grant is a `42501` waiting to happen — exactly the failure
-- 0002 exists to prevent, and one neither typecheck nor build catches. Rooms
-- cascade to entrants and matches, so those two need no delete of their own
-- until something wants to prune them independently.
grant select, insert, update, delete on public.rooms to service_role;
grant select, insert on public.room_entrants to service_role;
grant select, insert, update on public.matches to service_role;
