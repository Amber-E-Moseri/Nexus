drop function if exists public.get_space_statuses(uuid);
create or replace function public.get_space_statuses(p_department_id uuid)
returns setof public.task_status_definitions
language sql
stable
set search_path = public
as $$
  select tsd.*
  from public.task_status_definitions tsd
  where tsd.is_org_status = true
    or tsd.department_id = p_department_id
  order by tsd.is_org_status desc, tsd.sort_order asc, tsd.name asc;
$$;

grant execute on function public.get_space_statuses(uuid) to authenticated;

drop function if exists public.clone_global_statuses_for_space(uuid);
create or replace function public.clone_global_statuses_for_space(p_department_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if p_department_id is null then
    raise exception 'p_department_id is required';
  end if;

  if exists (
    select 1
    from public.task_status_definitions
    where department_id = p_department_id
  ) then
    return 0;
  end if;

  insert into public.task_status_definitions (
    name,
    color,
    category,
    legacy_key,
    is_default,
    active,
    sort_order,
    department_id
  )
  select
    name,
    color,
    category,
    legacy_key,
    is_default,
    active,
    sort_order,
    p_department_id
  from public.task_status_definitions
  where department_id is null;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.clone_global_statuses_for_space(uuid) to authenticated;

alter table public.task_status_definitions enable row level security;

drop policy if exists "task_status_definitions_select" on public.task_status_definitions;
drop policy if exists "task_status_definitions_admin_write" on public.task_status_definitions;
drop policy if exists "task_status_definitions_dept_lead_write" on public.task_status_definitions;
drop policy if exists "status_definitions_select_authenticated" on public.task_status_definitions;
drop policy if exists "status_definitions_manage_admin" on public.task_status_definitions;

create policy "status_definitions_select_authenticated"
on public.task_status_definitions
for select
to authenticated
using (true);

create policy "status_definitions_manage_admin"
on public.task_status_definitions
for all
to authenticated
using (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (
    (auth.jwt() ->> 'user_role') = 'dept_lead'
    and department_id = nullif(auth.jwt() ->> 'user_department_id', '')::uuid
  )
)
with check (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (
    (auth.jwt() ->> 'user_role') = 'dept_lead'
    and department_id = nullif(auth.jwt() ->> 'user_department_id', '')::uuid
  )
);

create index if not exists task_status_definitions_department_sort_order_idx
  on public.task_status_definitions (department_id, sort_order);
