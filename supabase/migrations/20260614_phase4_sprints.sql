-- ============================================================
-- PHASE 4 — SPRINTS
-- ============================================================

create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  goal text,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'completed', 'review', 'archived')),
  start_date date,
  end_date date,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  is_archived boolean not null default false
);

create table if not exists public.sprint_teams (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.sprint_members (
  sprint_id uuid not null references public.sprints(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  sprint_team_id uuid references public.sprint_teams(id) on delete set null,
  role text not null default 'member'
    check (role in ('manager', 'lead', 'member')),
  joined_at timestamptz not null default now(),
  primary key (sprint_id, user_id)
);

create table if not exists public.sprint_reviews (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null unique references public.sprints(id) on delete cascade,
  goals_achieved text,
  outstanding_items text,
  lessons_learned text,
  wins_testimonies text,
  recommendations text,
  final_decisions text,
  completed_by uuid references public.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

alter table public.tasks
  add column if not exists task_type text not null default 'space'
    check (task_type in ('space', 'sprint', 'personal'));

update public.tasks
set task_type = 'personal'
where is_personal = true
  and task_type <> 'personal';

create index if not exists sprints_status_idx on public.sprints(status);
create index if not exists sprints_created_by_idx on public.sprints(created_by);
create index if not exists sprint_members_user_idx on public.sprint_members(user_id);
create index if not exists sprint_members_sprint_idx on public.sprint_members(sprint_id);
create index if not exists tasks_sprint_id_idx on public.tasks(sprint_id);

create or replace function public.is_sprint_member(p_sprint_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.sprint_members
    where sprint_id = p_sprint_id
      and user_id = auth.uid()
  )
$$;

alter table public.sprints enable row level security;
alter table public.sprint_teams enable row level security;
alter table public.sprint_members enable row level security;
alter table public.sprint_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprints' and policyname = 'sprints_select'
  ) then
    create policy "sprints_select" on public.sprints
      for select to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or public.is_sprint_member(id)
        or created_by = auth.uid()
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprints' and policyname = 'sprints_insert'
  ) then
    create policy "sprints_insert" on public.sprints
      for insert to authenticated
      with check (
        public.current_user_role() in ('super_admin', 'dept_lead')
        and created_by = auth.uid()
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprints' and policyname = 'sprints_update'
  ) then
    create policy "sprints_update" on public.sprints
      for update to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or created_by = auth.uid()
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprints.id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      )
      with check (
        public.current_user_role() = 'super_admin'
        or created_by = auth.uid()
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprints.id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_teams' and policyname = 'sprint_teams_select'
  ) then
    create policy "sprint_teams_select" on public.sprint_teams
      for select to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or public.is_sprint_member(sprint_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_teams' and policyname = 'sprint_teams_write'
  ) then
    create policy "sprint_teams_write" on public.sprint_teams
      for all to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_teams.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      )
      with check (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_teams.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_members' and policyname = 'sprint_members_select'
  ) then
    create policy "sprint_members_select" on public.sprint_members
      for select to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or user_id = auth.uid()
        or public.is_sprint_member(sprint_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_members' and policyname = 'sprint_members_write'
  ) then
    create policy "sprint_members_write" on public.sprint_members
      for all to authenticated
      using (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_members.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      )
      with check (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_members.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_reviews' and policyname = 'sprint_reviews_select'
  ) then
    create policy "sprint_reviews_select" on public.sprint_reviews
      for select to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or public.is_sprint_member(sprint_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sprint_reviews' and policyname = 'sprint_reviews_write'
  ) then
    create policy "sprint_reviews_write" on public.sprint_reviews
      for all to authenticated
      using (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_reviews.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      )
      with check (
        public.current_user_role() = 'super_admin'
        or exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = sprint_reviews.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select_sprint_member'
  ) then
    create policy "tasks_select_sprint_member" on public.tasks
      for select to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and public.is_sprint_member(sprint_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_insert_sprint_manager'
  ) then
    create policy "tasks_insert_sprint_manager" on public.tasks
      for insert to authenticated
      with check (
        created_by = auth.uid()
        and task_type = 'sprint'
        and sprint_id is not null
        and exists (
          select 1
          from public.sprint_members sm
          where sm.sprint_id = tasks.sprint_id
            and sm.user_id = auth.uid()
            and sm.role in ('manager', 'lead')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_update_delete_sprint_manager'
  ) then
    create policy "tasks_update_delete_sprint_manager" on public.tasks
      for all to authenticated
      using (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprint_members sm
            where sm.sprint_id = tasks.sprint_id
              and sm.user_id = auth.uid()
              and sm.role in ('manager', 'lead')
          )
        )
      )
      with check (
        task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or created_by = auth.uid()
          or exists (
            select 1
            from public.sprint_members sm
            where sm.sprint_id = tasks.sprint_id
              and sm.user_id = auth.uid()
              and sm.role in ('manager', 'lead')
          )
        )
      );
  end if;
end $$;
