-- Allow integrations to be scoped to a specific department.
-- Super admin sees all rows. Department members only see rows matching their department
-- (or global rows with no department set).

alter table public.external_integrations
  add column if not exists department_id uuid references public.departments(id) on delete set null;

-- Allow the same integration name to exist once per department (and once globally).
alter table public.external_integrations
  drop constraint if exists external_integrations_name_key;

alter table public.external_integrations
  add constraint external_integrations_name_dept_key
  unique nulls not distinct (name, department_id);

-- Replace the select policy with one that understands department scoping.
drop policy if exists "external_integrations_select" on public.external_integrations;
create policy "external_integrations_select" on public.external_integrations
  for select to authenticated
  using (
    enabled = true and (
      public.current_user_role() = 'super_admin'
      or (
        department_id is null
        and (visible_to = 'all' or visible_to = public.current_user_role())
      )
      or (
        department_id is not null
        and department_id = public.current_user_department()
      )
    )
  );
