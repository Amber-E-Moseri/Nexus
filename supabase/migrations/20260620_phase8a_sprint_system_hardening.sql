alter table public.sprint_teams
  add column if not exists lead_user_id uuid references public.users(id) on delete set null;

create table if not exists public.sprint_team_members (
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  sprint_team_id uuid not null references public.sprint_teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sprint_team_id, user_id)
);

create index if not exists sprint_team_members_sprint_idx on public.sprint_team_members(sprint_id);
create index if not exists sprint_team_members_user_idx on public.sprint_team_members(user_id);

update public.sprint_members
set role = case
  when role = 'lead' then 'owner'
  when role = 'member' then 'contributor'
  else role
end
where role in ('lead', 'member');

alter table public.sprint_members
  drop constraint if exists sprint_members_role_check;

alter table public.sprint_members
  add constraint sprint_members_role_check
  check (role in ('owner', 'manager', 'contributor', 'viewer'));

insert into public.sprint_team_members (sprint_id, sprint_team_id, user_id)
select sprint_id, sprint_team_id, user_id
from public.sprint_members
where sprint_team_id is not null
on conflict (sprint_team_id, user_id) do nothing;

update public.sprint_teams st
set lead_user_id = candidate.user_id
from (
  select distinct on (sm.sprint_team_id)
    sm.sprint_team_id,
    sm.user_id
  from public.sprint_members sm
  where sm.sprint_team_id is not null
    and sm.role in ('owner', 'manager')
  order by sm.sprint_team_id, sm.joined_at
) candidate
where st.id = candidate.sprint_team_id
  and st.lead_user_id is null;

create or replace function public.can_manage_sprint(p_sprint_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.sprints s
    where s.id = p_sprint_id
      and (
        public.current_user_role() = 'super_admin'
        or s.created_by = auth.uid()
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

alter table public.sprint_team_members enable row level security;

drop policy if exists "sprints_update" on public.sprints;
create policy "sprints_update" on public.sprints
  for update to authenticated
  using (public.can_manage_sprint(id))
  with check (public.can_manage_sprint(id));

drop policy if exists "sprint_teams_write" on public.sprint_teams;
create policy "sprint_teams_write" on public.sprint_teams
  for all to authenticated
  using (public.can_manage_sprint(sprint_id))
  with check (public.can_manage_sprint(sprint_id));

drop policy if exists "sprint_members_write" on public.sprint_members;
create policy "sprint_members_write" on public.sprint_members
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  );

drop policy if exists "sprint_reviews_write" on public.sprint_reviews;
create policy "sprint_reviews_write" on public.sprint_reviews
  for all to authenticated
  using (public.can_manage_sprint(sprint_id))
  with check (public.can_manage_sprint(sprint_id));

drop policy if exists "tasks_insert_sprint_manager" on public.tasks;
create policy "tasks_insert_sprint_manager" on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and task_type = 'sprint'
    and sprint_id is not null
    and public.can_manage_sprint(sprint_id)
  );

drop policy if exists "tasks_update_delete_sprint_manager" on public.tasks;
create policy "tasks_update_delete_sprint_manager" on public.tasks
  for all to authenticated
  using (
    task_type = 'sprint'
    and sprint_id is not null
    and (
      public.current_user_role() = 'super_admin'
      or created_by = auth.uid()
      or public.can_manage_sprint(sprint_id)
    )
  )
  with check (
    task_type = 'sprint'
    and sprint_id is not null
    and (
      public.current_user_role() = 'super_admin'
      or created_by = auth.uid()
      or public.can_manage_sprint(sprint_id)
    )
  );

drop policy if exists "sprint_team_members_select" on public.sprint_team_members;
create policy "sprint_team_members_select" on public.sprint_team_members
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or user_id = auth.uid()
    or public.is_sprint_member(sprint_id)
  );

drop policy if exists "sprint_team_members_write" on public.sprint_team_members;
create policy "sprint_team_members_write" on public.sprint_team_members
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  );
