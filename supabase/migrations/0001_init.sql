-- prompt fight — initial schema.
--
-- One table. Every read and write goes through the Next.js route handlers
-- using the service role, so nothing anonymous ever touches this directly.

create extension if not exists "pgcrypto";

create table public.fighters (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,
  name        text not null,
  title       text not null,
  prompts     jsonb not null,
  stats       jsonb not null,
  moves       jsonb not null,
  flaw        jsonb not null,
  sprite      jsonb not null,
  wins        integer not null default 0,
  losses      integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Rate-limit lookups (session + recency) and the returning-player fetch.
create index fighters_session_created_idx on public.fighters (session_id, created_at desc);

-- RLS on with no policies at all: anon and authenticated are denied outright.
-- The service role bypasses RLS, which is the only path that exists.
alter table public.fighters enable row level security;

-- Pick a random opponent. Done in Postgres so the choice is unbiased rather
-- than "random from the first N rows the caller happened to fetch".
create or replace function public.pick_ghost(exclude_id uuid)
returns setof public.fighters
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.fighters
  where id <> exclude_id
  order by random()
  limit 1;
$$;

-- Atomic record update; two separate updates from the caller would race.
create or replace function public.record_result(winner uuid, loser uuid)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  update public.fighters set wins = wins + 1 where id = winner;
  update public.fighters set losses = losses + 1 where id = loser;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which anon and authenticated
-- inherit. Neither should be able to reach these.
revoke execute on function public.pick_ghost(uuid) from public;
revoke execute on function public.record_result(uuid, uuid) from public;
