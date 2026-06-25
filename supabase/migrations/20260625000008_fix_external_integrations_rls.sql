-- Fix RLS policy for external_integrations
-- Simplify and make more robust to handle all scoping cases

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
      -- Multi-department integration
      (
        (department_ids is not null and array_length(department_ids, 1) > 0)
        and public.current_user_department() = any(department_ids)
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

-- Also ensure write policy is correct
drop policy if exists "external_integrations_write" on public.external_integrations;
create policy "external_integrations_write" on public.external_integrations
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
