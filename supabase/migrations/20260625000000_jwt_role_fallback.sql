-- Restore a DB fallback for current_user_role() and current_user_department().
--
-- The previous version (20260623000002) was JWT-only. That is the correct end state,
-- but it means any session whose JWT was issued before the Auth hook went live will
-- receive a null role/department and be locked out of every RLS-protected table.
--
-- This version tries the JWT claim first (cheap, no DB round-trip) and falls back to
-- a direct lookup in public.users only when the claim is absent. The fallback MUST be
-- removed — by reverting to a JWT-only body — once the JWT hook has been confirmed
-- working in production for all active sessions (i.e. no sessions pre-date the hook).
-- Until then, removing it will silently break RLS for any user who has not yet
-- re-authenticated.

create or replace function public.current_user_role()
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(
    auth.jwt() ->> 'user_role',
    (select role from public.users where id = auth.uid())
  )
$$;

create or replace function public.current_user_department()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'user_department_id')::uuid,
    (select department_id from public.users where id = auth.uid())
  )
$$;
