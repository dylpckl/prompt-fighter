-- prompt fight — initial schema.
--
-- One table. Fighters are pool content: publicly readable by design, written
-- only by the Edge Functions (service role), never by the client.

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

alter table public.fighters enable row level security;

-- Anonymous clients may read the pool. They may not write to it — inserts and
-- record updates go through the Edge Functions, which use the service role and
-- bypass RLS. No write policy exists, so every client-side write is denied.
create policy "fighters are publicly readable"
  on public.fighters for select
  to anon, authenticated
  using (true);

-- Pick a random opponent. Done in Postgres so the choice is unbiased rather
-- than "random from the first N rows the client happened to fetch".
create or replace function public.pick_ghost(exclude_id uuid)
returns setof public.fighters
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.fighters
  where id <> exclude_id
  order by random()
  limit 1;
$$;

-- Atomic record update; two client-side updates would race.
create or replace function public.record_result(winner uuid, loser uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.fighters set wins = wins + 1 where id = winner;
  update public.fighters set losses = losses + 1 where id = loser;
$$;

revoke execute on function public.pick_ghost(uuid) from anon, authenticated;
revoke execute on function public.record_result(uuid, uuid) from anon, authenticated;
