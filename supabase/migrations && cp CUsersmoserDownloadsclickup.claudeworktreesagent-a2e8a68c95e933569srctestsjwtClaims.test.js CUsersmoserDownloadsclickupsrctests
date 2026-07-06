/*
  Fix: JWT custom_access_token_hook NULL-poisoning bug

  Problem:
    When department_id (or role) is NULL, `to_jsonb(NULL::text)` produces SQL NULL.
    `jsonb_set()` with a NULL new-value returns NULL for the ENTIRE expression, wiping
    the entire claims object. GoTrue then returns a 500 on login.

    Affected users:
      - super_admin accounts that have no department assignment
      - Invited users before department assignment completes

  Fix:
    Use a CASE expression for every field where the source column may be NULL.
    For user_department_id: fall back to the string 'none' so the key always
    exists in the JWT (downstream code and RLS policies check for its presence).
    For user_role: fall back to 'member' so a missing role never breaks auth.

  Companion fix:
    current_user_department() is updated to skip the UUID cast when the claim
    value is 'none', preventing invalid_text_representation errors in RLS policies.
*/

-- ────────────────────────────────────────────────────────────────
-- 1. Replace the hook function with NULL-safe claim injection
-- ────────────────────────────────────────────────────────────────
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_record public.users%rowtype;
  claims jsonb;
begin
  select *
  into user_record
  from public.users
  where id = (event ->> 'user_id')::uuid;

  if not found then
    return event;
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- user_role: guard against NULL role (should not happen in practice, but
  -- defensive against pre-seeded or partially-created accounts).
  claims := jsonb_set(
    claims,
    '{user_role}',
    CASE WHEN user_record.role IS NULL
      THEN to_jsonb('member'::text)
      ELSE to_jsonb(user_record.role)
    END,
    true
  );

  -- user_department_id: NULL for super_admin accounts and uninvited users.
  -- Store 'none' rather than SQL NULL so the key always exists in the JWT.
  -- Downstream: current_user_department() treats 'none' as NULL (see below).
  claims := jsonb_set(
    claims,
    '{user_department_id}',
    CASE WHEN user_record.department_id IS NULL
      THEN to_jsonb('none'::text)
      ELSE to_jsonb(user_record.department_id::text)
    END,
    true
  );

  return jsonb_set(event, '{claims}', claims, true);
exception
  when invalid_text_representation then
    return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, authenticated, anon;

comment on function public.custom_access_token_hook(jsonb)
is 'Injects user_role and user_department_id into JWT claims. NULL-safe: department_id=NULL maps to ''none'', role=NULL maps to ''member''.';


-- ────────────────────────────────────────────────────────────────
-- 2. Fix current_user_department() to handle the 'none' sentinel
--
--    The cast (auth.jwt() ->> 'user_department_id')::uuid raises
--    invalid_text_representation when the value is 'none'.
--    Use nullif() to convert 'none' -> NULL before the cast, then
--    fall back to a DB lookup as before.
-- ────────────────────────────────────────────────────────────────
create or replace function public.current_user_department()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- nullif converts both '' and 'none' to NULL before the UUID cast,
    -- preventing invalid_text_representation errors.
    nullif(nullif(auth.jwt() ->> 'user_department_id', ''), 'none')::uuid,
    (select department_id from public.users where id = auth.uid())
  )
$$;

comment on function public.current_user_department()
is 'Returns current user''s department UUID from JWT, treating ''none'' and empty string as NULL. Falls back to DB lookup for pre-hook sessions.';


-- ────────────────────────────────────────────────────────────────
-- 3. Fix current_user_role() to guard against NULL/missing claim
--
--    The existing fallback is safe for missing claims, but we add
--    an explicit empty-string guard for robustness.
-- ────────────────────────────────────────────────────────────────
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'user_role', ''),
    (select role from public.users where id = auth.uid())
  )
$$;

comment on function public.current_user_role()
is 'Returns current user role from JWT with DB fallback. Guards against empty string and NULL claims.';
