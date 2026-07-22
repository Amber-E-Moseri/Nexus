-- Make current_user_role() and current_user_department() DB-first.
--
-- Problem:
--   Both helpers preferred the JWT claim over the DB row, falling back to the
--   users table only when the claim was missing/empty. A session minted before
--   a role/department change (or one where the token hook wrote the 'member'/
--   'none' NULL-fallback) carries a stale claim that wins over the current DB
--   value. Net effect: the frontend (which reads users directly) authorizes an
--   action, but RLS — evaluating the stale claim — rejects it. Classic symptom:
--   a super_admin whose token predates the role grant gets
--   "new row violates row-level security policy for table tasks" on an
--   otherwise-permitted write.
--
-- Fix:
--   Invert the coalesce order — read the users row first, fall back to the JWT
--   claim only for pre-hook / rows-not-yet-readable sessions. Both functions are
--   SECURITY DEFINER + STABLE, so the users lookup bypasses RLS and is cached per
--   statement (one PK lookup, negligible at this scale). Role/department changes
--   now take effect on the next query for every session, with no token refresh or
--   TTL wait, closing the entire claim-staleness class for the 40+ policies that
--   call these helpers.
--
-- Note: the JWT is still injected by custom_access_token_hook and remains a valid
--   fallback; it is simply no longer the primary source of truth.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.users where id = auth.uid()),
    nullif(auth.jwt() ->> 'user_role', '')
  )
$$;

comment on function public.current_user_role()
is 'Returns current user role, DB-first (users row) with JWT claim fallback for pre-hook sessions. DB-first avoids stale-claim RLS rejections after a role change.';

create or replace function public.current_user_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select department_id from public.users where id = auth.uid()),
    -- nullif converts both '' and 'none' to NULL before the UUID cast,
    -- preventing invalid_text_representation errors.
    nullif(nullif(auth.jwt() ->> 'user_department_id', ''), 'none')::uuid
  )
$$;

comment on function public.current_user_department()
is 'Returns current user department UUID, DB-first (users row) with JWT claim fallback (''none''/'''' treated as NULL). DB-first avoids stale-claim RLS rejections after a department change.';
