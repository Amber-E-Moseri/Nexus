create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department_id uuid not null references public.departments(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  folder_id uuid not null references public.folders(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'space_lists'
  ) then
    create temp table _folder_seed (
      department_id uuid primary key,
      folder_id uuid not null
    ) on commit drop;

    insert into public.folders (name, department_id, sort_order, created_by, created_at)
    select
      'General',
      sl.space_id,
      0,
      (array_agg(sl.created_by order by sl.created_at))[1],
      min(sl.created_at)
    from public.space_lists sl
    where not exists (
      select 1
      from public.folders f
      where f.department_id = sl.space_id
        and f.sort_order = 0
    )
    group by sl.space_id;

    insert into _folder_seed (department_id, folder_id)
    select distinct on (f.department_id)
      f.department_id,
      f.id
    from public.folders f
    where f.sort_order = 0
    order by f.department_id, f.created_at, f.id;

    create temp table _list_migration_map (
      old_list_id uuid primary key,
      new_list_id uuid not null
    ) on commit drop;

    with inserted as (
      insert into public.lists (name, folder_id, department_id, sort_order, created_by, created_at)
      select
        sl.name,
        fs.folder_id,
        sl.space_id,
        sl.sort_order,
        sl.created_by,
        sl.created_at
      from public.space_lists sl
      join _folder_seed fs
        on fs.department_id = sl.space_id
      returning id, name, folder_id, department_id, sort_order, created_by, created_at
    )
    insert into _list_migration_map (old_list_id, new_list_id)
    select sl.id, inserted.id
    from public.space_lists sl
    join _folder_seed fs
      on fs.department_id = sl.space_id
    join inserted
      on inserted.folder_id = fs.folder_id
     and inserted.department_id = sl.space_id
     and inserted.name = sl.name
     and inserted.sort_order = sl.sort_order
     and inserted.created_at = sl.created_at
     and inserted.created_by is not distinct from sl.created_by;

    alter table public.tasks
      add column if not exists list_id_v2 uuid references public.lists(id) on delete set null;

    update public.tasks t
    set list_id_v2 = map.new_list_id
    from _list_migration_map map
    where t.list_id = map.old_list_id;

    drop view if exists public.actionable_tasks cascade;
    alter table public.tasks drop column if exists list_id;
    alter table public.tasks rename column list_id_v2 to list_id;
  else
    alter table public.tasks drop column if exists list_id;
    alter table public.tasks
      add column list_id uuid references public.lists(id) on delete set null;
  end if;
end $$;

create index if not exists folders_department_sort_idx
  on public.folders (department_id, sort_order);

create index if not exists lists_folder_sort_idx
  on public.lists (folder_id, sort_order);

create index if not exists lists_department_idx
  on public.lists (department_id);

create index if not exists tasks_list_id_idx
  on public.tasks (list_id)
  where list_id is not null;

alter table public.folders enable row level security;
alter table public.lists enable row level security;

drop policy if exists "folders_select" on public.folders;
drop policy if exists "folders_write" on public.folders;

create policy "folders_select"
on public.folders
for select
to authenticated
using (true);

create policy "folders_write"
on public.folders
for all
to authenticated
using (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (auth.jwt() ->> 'user_role') = 'dept_lead'
  or created_by = auth.uid()
)
with check (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (auth.jwt() ->> 'user_role') = 'dept_lead'
);

drop policy if exists "lists_select" on public.lists;
drop policy if exists "lists_write" on public.lists;

create policy "lists_select"
on public.lists
for select
to authenticated
using (true);

create policy "lists_write"
on public.lists
for all
to authenticated
using (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (auth.jwt() ->> 'user_role') = 'dept_lead'
  or created_by = auth.uid()
)
with check (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  or (auth.jwt() ->> 'user_role') = 'dept_lead'
);
