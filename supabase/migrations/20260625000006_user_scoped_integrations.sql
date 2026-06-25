-- Add support for user-specific integrations
-- Allows integrations to be assigned to individual users

alter table public.external_integrations
  add column if not exists user_id uuid references public.users(id) on delete set null;

alter table public.external_integrations
  add column if not exists user_ids uuid[] default array[]::uuid[];

-- Create indexes for faster lookups
create index if not exists external_integrations_user_id_idx
  on public.external_integrations(user_id);

create index if not exists external_integrations_user_ids_idx
  on public.external_integrations using gin (user_ids);

-- Update RLS policy to support user-scoped integrations
drop policy if exists "external_integrations_select" on public.external_integrations;

create policy "external_integrations_select" on public.external_integrations
  for select to authenticated
  using (
    enabled = true and (
      public.current_user_role() = 'super_admin'
      or (
        -- Global integration (no restrictions)
        department_id is null
        and (department_ids is null or array_length(department_ids, 1) is null)
        and user_id is null
        and (user_ids is null or array_length(user_ids, 1) is null)
        and (visible_to = 'all' or visible_to = public.current_user_role())
      )
      or (
        -- User-specific (single user - legacy)
        user_id is not null
        and user_id = auth.uid()
      )
      or (
        -- User-specific (multiple users)
        (user_ids is not null and array_length(user_ids, 1) > 0)
        and auth.uid() = any(user_ids)
      )
      or (
        -- Single department integration
        department_id is not null
        and department_id = public.current_user_department()
      )
      or (
        -- Multi-department integration
        (department_ids is not null and array_length(department_ids, 1) > 0)
        and public.current_user_department() = any(department_ids)
      )
    )
  );

-- Comments
comment on column public.external_integrations.user_id is
  'Legacy: single user who has access to this integration';

comment on column public.external_integrations.user_ids is
  'Array of user IDs who have access to this integration. If empty, integration is not user-scoped.';
