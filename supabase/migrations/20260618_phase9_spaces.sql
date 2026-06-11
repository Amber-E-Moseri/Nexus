-- ============================================================
-- PHASE 9 — SPACES
-- Departments ARE spaces. Extend, don't replace.
-- ============================================================

alter table public.departments
  add column if not exists space_type text not null default 'department'
    check (space_type in ('department', 'program', 'personal', 'sandbox'));

alter table public.departments
  add column if not exists visibility text not null default 'department'
    check (visibility in ('private', 'department', 'org'));

alter table public.departments
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived'));

alter table public.departments
  add column if not exists owner_id uuid references public.users(id);

alter table public.departments
  add column if not exists start_date date;

alter table public.departments
  add column if not exists end_date date;

alter table public.departments
  add column if not exists description text;

alter table public.departments
  add column if not exists updated_at timestamptz default now();

create table if not exists public.space_lists (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists space_lists_space_id_idx on public.space_lists(space_id);

alter table public.tasks
  add column if not exists list_id uuid references public.space_lists(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'sprints' and column_name = 'department_id'
  ) then
    alter table public.sprints
      add column department_id uuid references public.departments(id) on delete set null;
  end if;
end $$;

alter table public.space_lists enable row level security;

drop policy if exists "space_lists_select" on public.space_lists;
create policy "space_lists_select" on public.space_lists
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (
          u.department_id = space_lists.space_id
          or public.current_user_role() in ('super_admin', 'dept_lead')
        )
    )
  );

drop policy if exists "space_lists_write" on public.space_lists;
create policy "space_lists_write" on public.space_lists
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or created_by = auth.uid()
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or created_by = auth.uid()
  );

update public.departments
set
  space_type = 'department',
  visibility = 'department',
  status = 'active'
where space_type = 'department';

insert into public.space_lists (space_id, name, sort_order)
select d.id, 'General', 0
from public.departments d
where d.space_type = 'department'
  and not exists (
    select 1
    from public.space_lists sl
    where sl.space_id = d.id
  )
on conflict do nothing;
