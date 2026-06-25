-- Add support for multi-department integrations
-- Allows a single integration to be assigned to multiple departments

alter table public.external_integrations
  add column if not exists department_ids uuid[] default array[]::uuid[];

-- Create index for faster lookups
create index if not exists external_integrations_department_ids_idx
  on public.external_integrations using gin (department_ids);

-- Update RLS policy to support both single department_id and multiple department_ids
drop policy if exists "external_integrations_select" on public.external_integrations;

create policy "external_integrations_select" on public.external_integrations
  for select to authenticated
  using (
    enabled = true and (
      public.current_user_role() = 'super_admin'
      or (
        -- Global integration (no department restrictions)
        department_id is null
        and (department_ids is null or array_length(department_ids, 1) is null)
        and (visible_to = 'all' or visible_to = public.current_user_role())
      )
      or (
        -- Single department integration (legacy)
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

-- Comment on the column
comment on column public.external_integrations.department_ids is
  'Array of department IDs this integration is available to. If empty, treat as global.';
comment on column public.external_integrations.department_id is
  'Legacy single department field. Use department_ids for new integrations.';
