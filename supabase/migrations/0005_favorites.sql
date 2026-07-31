-- prompt fight — favorites.
--
-- One favorite per person, and being somebody's favorite is worth something in
-- the ring: a fighter's favorite count feeds the `crowd` pressure track, the one
-- already driven by Presence. Favorites are people in the room, so they push the
-- room's meter and nothing else — not hex, not fate, and nothing physical. See
-- `lib/engine/favorites.ts` for the curve and `lib/engine/sim.ts` for where it
-- lands.
--
-- Two things below are deliberate and worth reading before changing either.
--
-- 1. The count is denormalized onto `public.fighters`.
--
--    The sim needs both sides' counts on every fight, and the fight route's
--    opponent arrives through `pick_ghost`, which returns `setof
--    public.fighters` — there is no join to hang an aggregate off. A column
--    means every existing read path picks the count up for free, including that
--    one, and the roster and leaderboard get it without a second query. The
--    price is that the counter and the rows must be kept in step, which is why
--    every write goes through `set_favorite` / `clear_favorite` below and never
--    through a bare insert.
--
-- 2. A vote is keyed on *two* identities, and either one can claim it.
--
--    `session_id` is a UUID the browser invents, so on its own it caps nothing:
--    clear localStorage and you are a new voter. `voter_key` is the salted hash
--    of the forwarded client address — the same trick `rooms.host_key` uses in
--    0004, and the only identifier in the request the caller does not choose.
--
--    Both are unique, and `set_favorite` releases any row matching *either*
--    before inserting. That is what makes the two identities cooperate instead
--    of deadlocking: clearing storage doesn't earn a second vote (the voter_key
--    row is taken over), and it doesn't lock you out either (the takeover is a
--    move, not a rejection). Same for changing networks, from the other side.
--
--    It is still best-effort. Behind a proxy that strips the header the voter
--    key degrades to the session id and the cap is as soft as it was. That is
--    priced in: the boost is asymptotic and capped (see favorites.ts), so a
--    farmed favorite buys a sliver of one meter, not a win.
--
-- Same access story as 0001 and 0004: RLS on, zero policies, explicit grants to
-- service_role. The service role bypasses RLS but NOT table privileges, so
-- without the grants at the bottom every route handler dies with
-- `42501 permission denied`. See 0002 for the long version.

-- The denormalized count. Every fighter that already exists has none, and the
-- default makes that true without a backfill pass.
alter table public.fighters
  add column favorites integer not null default 0;

-- `favorites` is a check on the counter, not a claim about the rows: it can only
-- move through the two functions below, both of which floor it at zero.
alter table public.fighters
  add constraint fighters_favorites_check check (favorites >= 0);

create table public.favorites (
  -- The browser's self-issued identity. Unique, but see the header — on its own
  -- it is a limit on politeness.
  session_id  uuid primary key,
  fighter_id  uuid not null references public.fighters (id) on delete cascade,
  -- Salted hash of the forwarded client address, or `session:<uuid>` when there
  -- is no address to hash. Never a raw address.
  voter_key   text not null,
  created_at  timestamptz not null default now()
);

-- The other half of the identity pair. A unique index rather than a constraint
-- only because it reads as what it is: one live vote per voter key.
create unique index favorites_voter_key_idx on public.favorites (voter_key);

-- "Who favorited this fighter" — not read by anything today, but it is the index
-- that makes rebuilding a counter from the rows cheap, and a denormalized
-- counter without a way to recompute it is a counter you can never trust again.
create index favorites_fighter_idx on public.favorites (fighter_id);

-- RLS on with no policies at all: anon and authenticated are denied outright.
alter table public.favorites enable row level security;

-- Move a voter's single favorite onto `p_fighter`.
--
-- Idempotent by construction: favoriting the same fighter twice releases the row
-- and re-adds it, decrementing and incrementing the same counter, so the second
-- call is a no-op in everything but `created_at`. Returns the fighter's new
-- count.
--
-- Both statements are in one function so the counter and the rows cannot end up
-- disagreeing — a caller doing this as two round trips would leave a window
-- where they do.
create or replace function public.set_favorite(
  p_session   uuid,
  p_fighter   uuid,
  p_voter_key text
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_released uuid;
  v_count    integer;
begin
  -- Release whatever this voter already held, under *either* identity. At most
  -- two rows match, and they may point at the same fighter — decrementing per
  -- row is correct in both cases.
  for v_released in
    delete from public.favorites
    where session_id = p_session or voter_key = p_voter_key
    returning fighter_id
  loop
    update public.fighters
    set favorites = greatest(0, favorites - 1)
    where id = v_released;
  end loop;

  insert into public.favorites (session_id, fighter_id, voter_key)
  values (p_session, p_fighter, p_voter_key);

  update public.fighters
  set favorites = favorites + 1
  where id = p_fighter
  returning favorites into v_count;

  -- The fighter_id foreign key means the insert above would already have failed
  -- on a missing fighter, so this only fires if something raced a delete in
  -- between. Rolling back is the right answer either way.
  if v_count is null then
    raise exception 'no such fighter: %', p_fighter;
  end if;

  return v_count;
end;
$$;

-- Withdraw a voter's favorite. Same identity pair, same reasoning. Returns how
-- many rows were released, so a caller can tell "unfavorited" from "there was
-- nothing to unfavorite".
create or replace function public.clear_favorite(
  p_session   uuid,
  p_voter_key text
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_released uuid;
  v_rows     integer := 0;
begin
  for v_released in
    delete from public.favorites
    where session_id = p_session or voter_key = p_voter_key
    returning fighter_id
  loop
    update public.fighters
    set favorites = greatest(0, favorites - 1)
    where id = v_released;
    v_rows := v_rows + 1;
  end loop;

  return v_rows;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which anon and authenticated
-- inherit. Neither should be able to reach these — they move a number the sim
-- reads.
revoke execute on function public.set_favorite(uuid, uuid, text) from public;
revoke execute on function public.clear_favorite(uuid, text) from public;

-- The grants that actually make the route handler work. `delete` is on the table
-- because the two functions are `security invoker` and run as the caller, so the
-- service role needs the privilege in its own right — the function definition
-- does not lend it one.
grant select, insert, delete on public.favorites to service_role;
grant execute on function public.set_favorite(uuid, uuid, text) to service_role;
grant execute on function public.clear_favorite(uuid, text) to service_role;
