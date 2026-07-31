-- Grant the service role what it actually needs.
--
-- 0001 relied on Supabase's default privileges, which only fire for objects
-- created by `postgres`. Applied any other way (CLI, MCP, CI) the table and
-- functions land with no grants at all and every route handler gets
-- `42501 permission denied`.
--
-- Worth being explicit about, because it looks like an RLS problem and isn't:
-- the service role bypasses RLS, but it does NOT bypass table privileges. RLS
-- with zero policies is still the access-control story; these grants are just
-- what makes the one allowed path work.

grant select, insert, update on public.fighters to service_role;

-- 0001 revoked EXECUTE from PUBLIC to keep anon and authenticated out. The
-- service role held its EXECUTE by inheriting from PUBLIC, so that revoke
-- locked it out too. Grant it back directly — anon and authenticated stay out.
grant execute on function public.pick_ghost(uuid) to service_role;
grant execute on function public.record_result(uuid, uuid) to service_role;
