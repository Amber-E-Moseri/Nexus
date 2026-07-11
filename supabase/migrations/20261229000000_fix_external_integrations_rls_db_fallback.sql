-- Fix: external_integrations RLS policy with DB fallback for scoped integrations
--
-- Problem:
--   When current_user_department() returns NULL (stale JWT missing department claim),
--   the RLS check `public.current_user_department() = ANY(department_ids)` becomes
--   `NULL = ANY(...)` which is always false, even if the user's actual department
--   is in the array. This hides scoped integrations from users with stale tokens.
--
-- Solution:
--   Add a DB fallback: if the JWT claim is missing/null, look up the user's
--   actual department from the users table and check against department_ids.

drop policy if exists "external_integrations_select" on public.external_integrations;

create policy "external_integrations_select" on public.external_integrations
  for select to authenticated
  using (
    enabled = true and (
      -- Super admin sees all enabled integrations
      public.current_user_role() = 'super_admin'
      or
      -- Global integrations with no restrictions
      (
        coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
        and (department_ids is null or array_length(department_ids, 1) is null)
        and coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
        and (user_ids is null or array_length(user_ids, 1) is null)
        and (visible_to = 'all' or visible_to = public.current_user_role())
      )
      or
      -- Single department integration
      (
        department_id is not null
        and department_id = public.current_user_department()
      )
      or
      -- Multi-department integration: check JWT first, fall back to DB if null
      (
        (department_ids is not null and array_length(department_ids, 1) > 0)
        and (
          public.current_user_department() = any(department_ids)
          or (
            -- Fallback: JWT department is NULL, look up from DB
            public.current_user_department() is null
            and (select department_id from public.users where id = auth.uid()) = any(department_ids)
          )
        )
      )
      or
      -- Single user integration
      (
        user_id is not null
        and user_id = auth.uid()
      )
      or
      -- Multi-user integration
      (
        (user_ids is not null and array_length(user_ids, 1) > 0)
        and auth.uid() = any(user_ids)
      )
    )
  );
