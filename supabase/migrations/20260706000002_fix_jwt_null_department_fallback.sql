-- Restore DB fallback for current_user_department() when JWT claim is null.
--
-- 20260623000002 (harden_jwt_helpers) replaced the coalesce pattern with a
-- JWT-only read. That is correct for users whose sessions were issued after the
-- custom_access_token_hook went live, but it silently locks out two classes of
-- users:
--
--   1. Sessions issued before the hook was registered (JWT has no
--      user_department_id key → auth.jwt() ->> 'user_department_id' = SQL NULL).
--   2. Users whose department_id was NULL in the DB when their JWT was minted,
--      even if it was later set (stale claim).
--
-- In both cases the hardened helper returns SQL NULL, every RLS equality check
-- evaluates to FALSE (NULL = x is always unknown), and the user is locked out
-- of every department-scoped table.
--
-- Fix: coalesce back to a direct DB lookup on public.users when the JWT cast
-- produces NULL. The JWT-first path is preserved for sessions with a valid
-- claim — no performance regression for the common case.
--
-- current_user_role() is left JWT-only: role is always set at signup and the
-- hook runs on every token refresh, so stale-role sessions are not a realistic
-- concern. Only department_id has the null-at-invite timing window.

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
