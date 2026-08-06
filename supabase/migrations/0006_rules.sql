-- Rules — the part of a fighter that isn't a number.
--
-- Up to six `when → then` sentences per fighter, drawn from the fixed
-- vocabulary in `lib/engine/rules.ts`. This is where a description like
-- "invulnerable" or "wins automatically" actually lands: the stat budgets stay
-- exactly as they were, and the thing the player asked for goes here instead of
-- being flattened into a slightly larger number.
--
-- Deliberately *not* budgeted, unlike stats. The stat ceilings exist because a
-- stat line is permanent and moves a win/loss record; rules exist because the
-- point of the feature is that a player gets the fighter they described, up to
-- and including one that cannot lose. The engine's only guarantee is that a
-- fight terminates — see the header of rules.ts for why that holds no matter
-- what ends up in this column.
--
-- Stored as jsonb rather than a child table. Same reasoning as `favorites` in
-- 0005: the sim needs both sides' rules on every fight, and the fight route's
-- opponent arrives through `pick_ghost`, which returns `setof public.fighters`
-- and has no join to hang rows off. A column means every existing read path
-- picks the rules up for free, including that one.
--
-- Every fighter that already exists gets `[]`, and the default makes that true
-- without a backfill pass. An empty list is not a migration artifact to clean up
-- later — it is the correct and permanent answer for a fighter created before
-- rules existed, and `normalizeRules` produces the same `[]` for a row read
-- before this migration is applied, so the application behaves identically
-- either side of it. A fighter with no rules simulates bit-for-bit as it always
-- did: the sim's rules RNG is a separate stream that an empty list never draws
-- from.
--
-- No new tables and no new functions, so there is nothing to grant — the
-- service_role grants from 0002 still cover public.fighters. (Saying so out
-- loud because 0002 exists precisely because that is easy to forget.)

alter table public.fighters
  add column rules jsonb not null default '[]'::jsonb;

-- A cap on the column matching MAX_RULES in the application. The generator is
-- schema-constrained and normalizeRules truncates besides, so this is the third
-- lock on the same door — but it is the only one that survives someone loading
-- rows into this table by hand, and a fighter with four hundred rules is the one
-- shape that makes a fight slow rather than merely unfair.
alter table public.fighters
  add constraint fighters_rules_shape check (
    jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 6
  );
