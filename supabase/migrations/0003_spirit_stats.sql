-- Spirit stats — backfill the four new keys on every existing fighter.
--
-- Fighters gained a second, separate stat budget: 20 points across cha
-- (Presence), wil (Resolve), arc (Weirdness) and luk (Fate). The body budget of
-- 30 across hp/atk/def/spd is untouched, and the two can never be traded
-- against each other — two hard ceilings instead of one.
--
-- Rows written before this migration have only the body four in `stats`. They
-- get a flat 5/5/5/5, which is 20 on the nose. Flat is the right answer rather
-- than a guess: nobody wrote a description for these fighters' spirit, so any
-- shape we invented would be a lie about a fighter someone already owns, and
-- flat is the one spread that is provably on-budget. New fighters get a real
-- spread from the generator.
--
-- Worth saying out loud, because it is not obvious: flat is *on-budget*, it is
-- not *neutral*. Pressure rewards commitment on both sides — a flat 5 is a
-- middling pusher and a middling defender at once, so a backfilled fighter
-- meeting a committed one takes considerably more pressure losses than it
-- scores. Measured over 20k fights against random legal spreads: overall win
-- rate 48%, pressure wins by the flat fighter 0.1%, against it 4.0%. That is
-- the price of not inventing a spirit line for somebody else's fighter, and it
-- is small enough to be worth paying — but if it ever stops being small, the
-- fix is to derive a deterministic spread from the stored prompts rather than
-- to nudge these numbers.
--
-- The application normalizes the same way on read (normalizeStats defaults
-- missing spirit keys to 5), so this migration is belt-and-braces — it makes
-- what is stored match what is served.
--
-- Idempotent: `|| stats` puts the existing object on the right-hand side of the
-- merge, so any key already present wins and re-running changes nothing. The
-- WHERE clause means a second run touches zero rows at all.
--
-- No new tables and no new functions here, so there is nothing to grant. The
-- service_role grants from 0002 still cover public.fighters. (Saying so out
-- loud because 0002 exists precisely because that is easy to forget.)

update public.fighters
set stats = jsonb_build_object(
      'cha', 5,
      'wil', 5,
      'arc', 5,
      'luk', 5
    ) || stats
where not (stats ?& array['cha', 'wil', 'arc', 'luk']);
