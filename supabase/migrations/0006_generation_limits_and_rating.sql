-- prompt fight — generation limits and Elo rating.
--
-- 1. Rate-limit model calls, not inserted fighters.
--
--    The old limit counted `fighters` rows per `session_id`. Both halves were
--    wrong: the session id is a UUID the browser invents (send a fresh one,
--    count zero), and a prompt the model refuses or marks unsafe never inserts
--    a row, so it was never counted at all — while still costing a model call.
--    `claim_generation` records every attempt *before* the call, keyed on the
--    hashed client address as well as the session, and enforces a global daily
--    ceiling so the worst case is a known bill.
--
-- 2. Rank by Elo instead of raw wins.
--
--    Raw wins reward age. `rating` starts at 1000 and moves inside
--    `record_result`, under row locks, so two fights involving the same ghost
--    can't both read the old rating.
--
-- Same access story as every other migration: RLS on, zero policies, explicit
-- grants to service_role, EXECUTE revoked from PUBLIC.

create table public.generation_attempts (
  id          bigint generated always as identity primary key,
  -- Hashed client address, or `session:<uuid>` when there is none.
  client_key  text not null,
  session_id  uuid not null,
  created_at  timestamptz not null default now()
);

create index generation_attempts_key_idx on public.generation_attempts (client_key, created_at desc);
create index generation_attempts_session_idx on public.generation_attempts (session_id, created_at desc);
create index generation_attempts_created_idx on public.generation_attempts (created_at);

alter table public.generation_attempts enable row level security;

-- Returns 'ok' and records the attempt, or the name of the limit that refused
-- it: 'session', 'client' or 'global'. Refused attempts are not recorded, so
-- waiting out a limit works.
--
-- The advisory lock serialises concurrent attempts from one client so a burst
-- of parallel requests can't all pass the count before any of them inserts.
-- The global ceiling can overshoot by however many clients race at the very
-- edge of it, which is a rounding error on a daily budget.
create or replace function public.claim_generation(
  p_client_key  text,
  p_session     uuid,
  p_per_session integer,
  p_per_client  integer,
  p_per_day     integer
)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_hour timestamptz := now() - interval '1 hour';
begin
  perform pg_advisory_xact_lock(hashtext(p_client_key));

  if (select count(*) from generation_attempts
      where session_id = p_session and created_at >= v_hour) >= p_per_session then
    return 'session';
  end if;

  if (select count(*) from generation_attempts
      where client_key = p_client_key and created_at >= v_hour) >= p_per_client then
    return 'client';
  end if;

  if (select count(*) from generation_attempts
      where created_at >= now() - interval '1 day') >= p_per_day then
    return 'global';
  end if;

  insert into generation_attempts (client_key, session_id) values (p_client_key, p_session);

  -- Nothing older than the widest window is ever read again.
  delete from generation_attempts where created_at < now() - interval '2 days';

  return 'ok';
end;
$$;

alter table public.fighters
  add column rating integer not null default 1000;

create index fighters_rating_idx on public.fighters (rating desc, wins desc);

-- The signature changes (it now returns the new ratings), so the old function
-- has to go rather than be replaced, and its grants go with it.
drop function public.record_result(uuid, uuid);

-- Standard Elo, K = 32. The winner gains exactly what the loser drops, and
-- always at least one point, so beating a much weaker fighter still moves the
-- number. Rows are locked in id order so two concurrent fights over the same
-- pair can't deadlock.
create or replace function public.record_result(winner uuid, loser uuid)
returns table (winner_rating integer, loser_rating integer)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_w     integer;
  v_l     integer;
  v_delta integer;
begin
  perform 1 from fighters where id in (winner, loser) order by id for update;

  select rating into v_w from fighters where id = winner;
  select rating into v_l from fighters where id = loser;
  if v_w is null or v_l is null then
    raise exception 'no such fighter: % / %', winner, loser;
  end if;

  v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_l - v_w) / 400.0)))))::integer;

  update fighters set wins = wins + 1, rating = rating + v_delta where id = winner;
  update fighters set losses = losses + 1, rating = rating - v_delta where id = loser;

  return query select v_w + v_delta, v_l - v_delta;
end;
$$;

revoke execute on function public.claim_generation(text, uuid, integer, integer, integer) from public;
revoke execute on function public.record_result(uuid, uuid) from public;

grant select, insert, delete on public.generation_attempts to service_role;
grant execute on function public.claim_generation(text, uuid, integer, integer, integer) to service_role;
grant execute on function public.record_result(uuid, uuid) to service_role;
