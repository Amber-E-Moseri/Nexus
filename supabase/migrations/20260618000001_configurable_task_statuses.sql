create table if not exists public.task_status_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  category text not null check (category in ('open', 'in_progress', 'completed', 'cancelled')),
  department_id uuid references public.departments(id) on delete cascade,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  active boolean not null default true,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_status_definitions_global_name_idx
  on public.task_status_definitions (lower(name))
  where department_id is null;

create unique index if not exists task_status_definitions_department_name_idx
  on public.task_status_definitions (department_id, lower(name))
  where department_id is not null;

create unique index if not exists task_status_definitions_global_legacy_idx
  on public.task_status_definitions (legacy_key)
  where department_id is null and legacy_key is not null;

create unique index if not exists task_status_definitions_department_legacy_idx
  on public.task_status_definitions (department_id, legacy_key)
  where department_id is not null and legacy_key is not null;

create index if not exists task_status_definitions_department_sort_idx
  on public.task_status_definitions (department_id, active, sort_order);

insert into public.task_status_definitions (name, color, category, department_id, sort_order, is_default, active, legacy_key)
select seed.name, seed.color, seed.category, null, seed.sort_order, seed.is_default, true, seed.legacy_key
from (
  values
    ('Not Started', '#7A7D86', 'open', 1, true, 'backlog'),
    ('In Progress', '#378ADD', 'in_progress', 2, false, 'in_progress'),
    ('Review', '#C78512', 'in_progress', 3, false, 'review'),
    ('Blocked', '#C65353', 'in_progress', 4, false, 'blocked'),
    ('Completed', '#639922', 'completed', 5, false, 'done'),
    ('Cancelled', '#7A7D86', 'cancelled', 6, false, 'cancelled')
) as seed(name, color, category, sort_order, is_default, legacy_key)
where not exists (
  select 1
  from public.task_status_definitions existing
  where existing.department_id is null
    and existing.legacy_key = seed.legacy_key
);

insert into public.task_status_definitions (name, color, category, department_id, sort_order, is_default, active, legacy_key)
select seed.name, seed.color, seed.category, departments.id, seed.sort_order, seed.is_default, true, seed.legacy_key
from public.departments
cross join (
  values
    ('Not Started', '#7A7D86', 'open', 1, true, 'backlog'),
    ('In Progress', '#378ADD', 'in_progress', 2, false, 'in_progress'),
    ('Review', '#C78512', 'in_progress', 3, false, 'review'),
    ('Blocked', '#C65353', 'in_progress', 4, false, 'blocked'),
    ('Completed', '#639922', 'completed', 5, false, 'done'),
    ('Cancelled', '#7A7D86', 'cancelled', 6, false, 'cancelled')
) as seed(name, color, category, sort_order, is_default, legacy_key)
where not exists (
  select 1
  from public.task_status_definitions existing
  where existing.department_id = departments.id
    and existing.legacy_key = seed.legacy_key
);

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add column if not exists status_id uuid references public.task_status_definitions(id);

update public.tasks task
set status_id = status_map.id
from public.task_status_definitions status_map
where task.status_id is null
  and (
    (task.department_id is not null and status_map.department_id = task.department_id)
    or (task.department_id is null and status_map.department_id is null)
  )
  and status_map.legacy_key = coalesce(task.status, 'backlog');

update public.tasks
set status_id = (
  select id
  from public.task_status_definitions status_map
  where (
      (tasks.department_id is not null and status_map.department_id = tasks.department_id)
      or (tasks.department_id is null and status_map.department_id is null)
    )
    and status_map.is_default = true
  order by status_map.sort_order
  limit 1
)
where status_id is null;

alter table public.tasks
  alter column status_id set not null;

create index if not exists tasks_status_id_idx on public.tasks(status_id);

create or replace function public.touch_task_status_definition()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists task_status_definitions_touch_updated_at on public.task_status_definitions;
create trigger task_status_definitions_touch_updated_at
before update on public.task_status_definitions
for each row
execute function public.touch_task_status_definition();

create or replace function public.sync_task_status_fields()
returns trigger
language plpgsql
as $$
declare
  resolved_status public.task_status_definitions%rowtype;
  preferred_legacy text;
begin
  preferred_legacy := coalesce(new.status, 'backlog');

  if new.status_id is null then
    select *
    into resolved_status
    from public.task_status_definitions
    where (
        (new.department_id is not null and department_id = new.department_id)
        or (new.department_id is null and department_id is null)
      )
      and active = true
      and (
        legacy_key = preferred_legacy
        or (preferred_legacy is null and is_default = true)
      )
    order by
      case when legacy_key = preferred_legacy then 0 else 1 end,
      case when is_default then 0 else 1 end,
      sort_order
    limit 1;

    if resolved_status.id is null then
      select *
      into resolved_status
      from public.task_status_definitions
      where (
          (new.department_id is not null and department_id = new.department_id)
          or (new.department_id is null and department_id is null)
        )
        and active = true
      order by case when is_default then 0 else 1 end, sort_order
      limit 1;
    end if;

    new.status_id := resolved_status.id;
  else
    select *
    into resolved_status
    from public.task_status_definitions
    where id = new.status_id;
  end if;

  if resolved_status.id is not null then
    new.status := coalesce(
      resolved_status.legacy_key,
      regexp_replace(lower(resolved_status.name), '\s+', '_', 'g')
    );

    if resolved_status.category = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif tg_op = 'insert' or (old.status_id is distinct from new.status_id) then
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_status_fields on public.tasks;
create trigger tasks_sync_status_fields
before insert or update on public.tasks
for each row
execute function public.sync_task_status_fields();

alter table public.task_status_definitions enable row level security;

create policy "task_status_definitions_select"
on public.task_status_definitions
for select
to authenticated
using (true);

create policy "task_status_definitions_admin_write"
on public.task_status_definitions
for all
to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

create policy "task_status_definitions_dept_lead_write"
on public.task_status_definitions
for all
to authenticated
using (
  public.current_user_role() = 'dept_lead'
  and department_id = public.current_user_department()
)
with check (
  public.current_user_role() = 'dept_lead'
  and department_id = public.current_user_department()
);
