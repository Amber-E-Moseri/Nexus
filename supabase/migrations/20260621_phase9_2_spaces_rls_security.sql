create table if not exists public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'contributor', 'viewer')),
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create index if not exists space_members_space_idx on public.space_members(space_id);
create index if not exists space_members_user_idx on public.space_members(user_id);

alter table public.space_members enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'super_admin'
  )
$$;

create or replace function public.is_space_member(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
  v_department_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id
    into v_space_type, v_owner_id
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  if v_space_type = 'department' then
    select u.department_id
      into v_department_id
    from public.users u
    where u.id = auth.uid();

    return v_department_id = space_uuid;
  end if;

  if v_owner_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
  );
end;
$$;

create or replace function public.can_view_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
  v_department_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id
    into v_space_type, v_owner_id
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  if v_space_type = 'personal' then
    return v_owner_id = auth.uid();
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  if v_space_type = 'department' then
    select u.department_id
      into v_department_id
    from public.users u
    where u.id = auth.uid();

    return v_department_id = space_uuid;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
  );
end;
$$;

create or replace function public.can_manage_space(space_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
  v_role text;
  v_department_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select d.space_type, d.owner_id
    into v_space_type, v_owner_id
  from public.departments d
  where d.id = space_uuid;

  if not found then
    return false;
  end if;

  if v_space_type = 'personal' then
    return v_owner_id = auth.uid();
  end if;

  if public.is_super_admin() then
    return true;
  end if;

  select u.role, u.department_id
    into v_role, v_department_id
  from public.users u
  where u.id = auth.uid();

  if v_space_type = 'department' then
    return v_role = 'dept_lead' and v_department_id = space_uuid;
  end if;

  if v_owner_id = auth.uid() then
    return true;
  end if;

  return exists (
    select 1
    from public.space_members sm
    where sm.space_id = space_uuid
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'manager')
  );
end;
$$;

create or replace function public.can_manage_sprint(p_sprint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sprints s
    where s.id = p_sprint_id
      and (
        public.is_super_admin()
        or s.created_by = auth.uid()
        or (
          s.department_id is not null
          and public.can_manage_space(s.department_id)
        )
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = p_sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('owner', 'manager')
        )
      )
  )
$$;

create or replace function public.sync_space_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.owner_id is distinct from new.owner_id
    and old.owner_id is not null then
    delete from public.space_members
    where space_id = new.id
      and user_id = old.owner_id
      and role = 'owner';
  end if;

  if new.owner_id is not null then
    insert into public.space_members (space_id, user_id, role, added_by)
    values (new.id, new.owner_id, 'owner', new.owner_id)
    on conflict (space_id, user_id) do update
      set role = 'owner',
          added_by = coalesce(public.space_members.added_by, excluded.added_by);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_space_owner_membership on public.departments;
create trigger sync_space_owner_membership
after insert or update of owner_id, space_type
on public.departments
for each row
execute function public.sync_space_owner_membership();

with dept_lead_owners as (
  select distinct on (d.id)
    d.id as space_id,
    u.id as owner_id
  from public.departments d
  join public.users u
    on u.department_id = d.id
   and u.role = 'dept_lead'
  where d.space_type = 'department'
    and d.owner_id is null
  order by d.id, u.created_at, u.id
)
update public.departments d
set owner_id = dlo.owner_id,
    updated_at = now()
from dept_lead_owners dlo
where d.id = dlo.space_id
  and d.owner_id is null;

with first_super_admin as (
  select u.id
  from public.users u
  where u.role = 'super_admin'
  order by u.created_at, u.id
  limit 1
)
update public.departments d
set owner_id = fsa.id,
    updated_at = now()
from first_super_admin fsa
where d.owner_id is null;

insert into public.space_members (space_id, user_id, role, added_by)
select d.id, d.owner_id, 'owner', d.owner_id
from public.departments d
where d.owner_id is not null
on conflict (space_id, user_id) do update
  set role = 'owner',
      added_by = coalesce(public.space_members.added_by, excluded.added_by);

drop policy if exists "departments_select_authenticated" on public.departments;
create policy "departments_select_spaces"
on public.departments
for select
to authenticated
using (public.can_view_space(id));

create policy "departments_insert_spaces"
on public.departments
for insert
to authenticated
with check (
  (
    public.is_super_admin()
    and (
      owner_id is null
      or owner_id = auth.uid()
      or space_type <> 'personal'
    )
  )
  or (
    public.current_user_role() = 'dept_lead'
    and space_type in ('program', 'personal', 'sandbox')
    and owner_id = auth.uid()
  )
);

create policy "departments_update_spaces"
on public.departments
for update
to authenticated
using (public.can_manage_space(id))
with check (public.can_manage_space(id));

drop policy if exists "space_lists_select" on public.space_lists;
create policy "space_lists_select"
on public.space_lists
for select
to authenticated
using (public.can_view_space(space_id));

drop policy if exists "space_lists_write" on public.space_lists;
create policy "space_lists_insert"
on public.space_lists
for insert
to authenticated
with check (public.can_manage_space(space_id));

create policy "space_lists_update"
on public.space_lists
for update
to authenticated
using (public.can_manage_space(space_id))
with check (public.can_manage_space(space_id));

create policy "space_members_select"
on public.space_members
for select
to authenticated
using (
  public.is_super_admin()
  or user_id = auth.uid()
  or public.can_view_space(space_id)
);

create policy "space_members_insert"
on public.space_members
for insert
to authenticated
with check (public.can_manage_space(space_id));

create policy "space_members_update"
on public.space_members
for update
to authenticated
using (public.can_manage_space(space_id))
with check (public.can_manage_space(space_id));

create policy "space_members_delete"
on public.space_members
for delete
to authenticated
using (public.can_manage_space(space_id));

create policy "users_select_space_members"
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.space_members sm_self
    join public.space_members sm_peer
      on sm_peer.space_id = sm_self.space_id
    where sm_self.user_id = auth.uid()
      and sm_peer.user_id = users.id
  )
  or exists (
    select 1
    from public.departments d
    where d.id = users.department_id
      and d.space_type = 'department'
      and public.can_view_space(d.id)
  )
);

create policy "tasks_select_space_access"
on public.tasks
for select
to authenticated
using (
  not is_personal
  and (
    (
      department_id is not null
      and public.can_view_space(department_id)
    )
    or (
      sprint_id is not null
      and exists (
        select 1
        from public.sprints s
        where s.id = tasks.sprint_id
          and s.department_id is not null
          and public.can_view_space(s.department_id)
      )
    )
  )
);

create policy "tasks_insert_space_manager"
on public.tasks
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    (
      coalesce(task_type, '') <> 'sprint'
      and department_id is not null
      and public.can_manage_space(department_id)
    )
    or (
      sprint_id is not null
      and public.can_manage_sprint(sprint_id)
    )
  )
);

create policy "tasks_update_space_manager"
on public.tasks
for update
to authenticated
using (
  (
    coalesce(task_type, '') <> 'sprint'
    and department_id is not null
    and public.can_manage_space(department_id)
  )
  or (
    sprint_id is not null
    and public.can_manage_sprint(sprint_id)
  )
)
with check (
  (
    coalesce(task_type, '') <> 'sprint'
    and department_id is not null
    and public.can_manage_space(department_id)
  )
  or (
    sprint_id is not null
    and public.can_manage_sprint(sprint_id)
  )
);

create policy "tasks_delete_space_manager"
on public.tasks
for delete
to authenticated
using (
  (
    coalesce(task_type, '') <> 'sprint'
    and department_id is not null
    and public.can_manage_space(department_id)
  )
  or (
    sprint_id is not null
    and public.can_manage_sprint(sprint_id)
  )
);

drop policy if exists "sprints_update" on public.sprints;
create policy "sprints_update"
on public.sprints
for update
to authenticated
using (public.can_manage_sprint(id))
with check (public.can_manage_sprint(id));

drop policy if exists "sprints_insert" on public.sprints;
create policy "sprints_insert"
on public.sprints
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or (
      department_id is not null
      and public.can_manage_space(department_id)
    )
  )
);

create policy "sprints_select_space_access"
on public.sprints
for select
to authenticated
using (
  department_id is not null
  and public.can_view_space(department_id)
);

create policy "sprint_teams_select_space_access"
on public.sprint_teams
for select
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = sprint_teams.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

create policy "sprint_members_select_space_access"
on public.sprint_members
for select
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = sprint_members.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

create policy "sprint_reviews_select_space_access"
on public.sprint_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.sprints s
    where s.id = sprint_reviews.sprint_id
      and s.department_id is not null
      and public.can_view_space(s.department_id)
  )
);

drop policy if exists "sprint_team_members_select" on public.sprint_team_members;
create policy "sprint_team_members_select" on public.sprint_team_members
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or public.is_sprint_member(sprint_id)
    or exists (
      select 1
      from public.sprints s
      where s.id = sprint_team_members.sprint_id
        and s.department_id is not null
        and public.can_view_space(s.department_id)
    )
  );
