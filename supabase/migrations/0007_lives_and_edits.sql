-- prompt fight — lives and edits.
--
-- A fighter has three lives. Losing a fight *you started* costs one and banks
-- a single edit: change one prompt slot and the fighter is regenerated as the
-- next version of itself. The third loss kills it, and the dead don't fight.
--
-- Only the challenger can lose a life. A fighter picked as a ghost while its
-- owner is away still moves its record and rating, but it can't die off
-- screen — the owner has to be there for it.
--
-- Same access story as every other migration: RLS on, zero policies, explicit
-- grants to service_role, EXECUTE revoked from PUBLIC.

alter table public.fighters
  add column lives_lost      integer not null default 0,
  -- Banked edits. At most one: losing twice without editing doesn't stack.
  add column edits_available integer not null default 0,
  add column version         integer not null default 1,
  add column dead_at         timestamptz;

alter table public.fighters
  add constraint fighters_lives_lost_check check (lives_lost >= 0),
  add constraint fighters_edits_available_check check (edits_available between 0 and 1),
  add constraint fighters_version_check check (version >= 1);

-- The dead are out of the game, including as somebody else's opponent.
-- Same signature, so the grants from 0002 carry over.
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
    and dead_at is null
  order by random()
  limit 1;
$$;

-- Replaced by record_bout, which knows which side started the fight.
drop function public.record_result(uuid, uuid);

-- Records one server-matched fight: both records, both ratings (Elo, K = 32),
-- and — only if the challenger lost — one of its lives.
--
-- Both rows are locked in id order, so concurrent fights over the same pair
-- can't deadlock, and the alive check is made under the lock, so a
-- double-clicked fight on a fighter's last life can't be fought twice.
create or replace function public.record_bout(
  p_challenger     uuid,
  p_opponent       uuid,
  p_challenger_won boolean,
  p_max_lives      integer
)
returns table (
  challenger_rating integer,
  opponent_rating   integer,
  lives_lost        integer,
  edits_available   integer,
  dead_at           timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_c       public.fighters%rowtype;
  v_o       public.fighters%rowtype;
  v_w       integer;
  v_l       integer;
  v_delta   integer;
begin
  perform 1 from fighters f where f.id in (p_challenger, p_opponent) order by f.id for update;

  select * into v_c from fighters f where f.id = p_challenger;
  select * into v_o from fighters f where f.id = p_opponent;
  if v_c.id is null or v_o.id is null then
    raise exception 'no such fighter: % / %', p_challenger, p_opponent;
  end if;
  if v_c.dead_at is not null then
    raise exception 'fighter is dead: %', p_challenger using errcode = 'P0002';
  end if;

  if p_challenger_won then
    v_w := v_c.rating; v_l := v_o.rating;
  else
    v_w := v_o.rating; v_l := v_c.rating;
  end if;
  -- The winner gains what the loser drops, and always at least one point.
  v_delta := greatest(1, round(32 * (1 - 1 / (1 + power(10, (v_l - v_w) / 400.0)))))::integer;

  if p_challenger_won then
    update fighters f set wins = f.wins + 1, rating = f.rating + v_delta where f.id = p_challenger;
    update fighters f set losses = f.losses + 1, rating = f.rating - v_delta where f.id = p_opponent;
  else
    update fighters f set wins = f.wins + 1, rating = f.rating + v_delta where f.id = p_opponent;
    update fighters f
    set losses          = f.losses + 1,
        rating          = f.rating - v_delta,
        lives_lost      = f.lives_lost + 1,
        dead_at         = case when f.lives_lost + 1 >= p_max_lives then now() end,
        edits_available = case when f.lives_lost + 1 >= p_max_lives then 0 else 1 end
    where f.id = p_challenger;
  end if;

  return query
    select c.rating, o.rating, c.lives_lost, c.edits_available, c.dead_at
    from fighters c, fighters o
    where c.id = p_challenger and o.id = p_opponent;
end;
$$;

revoke execute on function public.record_bout(uuid, uuid, boolean, integer) from public;
grant execute on function public.record_bout(uuid, uuid, boolean, integer) to service_role;
