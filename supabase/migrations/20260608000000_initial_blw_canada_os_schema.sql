create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '534AB7',
  health_status text not null default 'on_track'
    check (health_status in ('on_track', 'at_risk', 'off_track')),
  created_at timestamptz not null default now()
);

insert into public.departments (name, color)
values
  ('Admin', '185FA5'),
  ('PFCC', '3B6D11'),
  ('Media', '854F0B'),
  ('ORS', 'A32D2D'),
  ('Pastors', '534AB7')
on conflict (name) do nothing;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'member'
    check (role in ('super_admin', 'dept_lead', 'pastor', 'member')),
  department_id uuid references public.departments(id),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.pastor_members (
  pastor_id uuid not null references public.users(id) on delete cascade,
  member_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pastor_id, member_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_personal boolean not null default false,
  status text not null default 'backlog'
    check (status in ('backlog', 'in_progress', 'review', 'done', 'blocked')),
  priority text not null default 'medium'
    check (priority in ('urgent', 'high', 'medium', 'low')),
  assignee_id uuid references public.users(id),
  department_id uuid references public.departments(id),
  parent_task_id uuid references public.tasks(id),
  meeting_id uuid,
  goal_id uuid,
  source text not null default 'manual'
    check (source in ('manual', 'meeting', 'automation', 'admin_processor', 'zoom')),
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department_id uuid references public.departments(id),
  owner_id uuid references public.users(id),
  target_value numeric not null default 100,
  current_value numeric not null default 0,
  due_date date,
  status text not null default 'not_started'
    check (status in ('not_started', 'on_track', 'at_risk', 'behind', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid references public.departments(id),
  date timestamptz not null,
  meeting_type text not null default 'general',
  agenda jsonb,
  minutes text,
  transcript text,
  summary text,
  zoom_join_url text,
  drive_url text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_attendance (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'present'
    check (status in ('present', 'absent', 'excused')),
  primary key (meeting_id, user_id)
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department_id uuid references public.departments(id),
  created_by uuid references public.users(id),
  trigger_type text not null,
  conditions jsonb not null default '{}',
  actions jsonb not null default '[]',
  enabled boolean not null default true,
  last_fired timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  "timestamp" timestamptz not null default now()
);

create table if not exists public.user_notification_prefs (
  user_id uuid not null references public.users(id) on delete cascade,
  notification_type text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  primary key (user_id, notification_type)
);

alter table public.departments enable row level security;
alter table public.users enable row level security;
alter table public.pastor_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.goals enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.automations enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_log enable row level security;
alter table public.user_notification_prefs enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.current_user_department()
returns uuid
language sql
stable
as $$
  select department_id from public.users where id = auth.uid()
$$;

create policy "departments_select_authenticated"
on public.departments
for select
to authenticated
using (true);

create policy "users_select_own"
on public.users
for select
to authenticated
using (auth.uid() = id);

create policy "users_select_leads"
on public.users
for select
to authenticated
using (public.current_user_role() in ('super_admin', 'dept_lead'));

create policy "users_select_pastor_members"
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.pastor_members pm
    where pm.pastor_id = auth.uid() and pm.member_id = users.id
  )
);

create policy "pastor_members_select_self"
on public.pastor_members
for select
to authenticated
using (pastor_id = auth.uid() or member_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "tasks_select_member"
on public.tasks
for select
to authenticated
using (
  assignee_id = auth.uid()
  or created_by = auth.uid()
  or (is_personal = false and department_id = public.current_user_department())
);

create policy "tasks_select_lead"
on public.tasks
for select
to authenticated
using (
  public.current_user_role() = 'dept_lead'
  and public.current_user_department() = department_id
);

create policy "tasks_select_admin"
on public.tasks
for select
to authenticated
using (public.current_user_role() = 'super_admin');

create policy "tasks_select_pastor"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.pastor_members pm
    where pm.pastor_id = auth.uid() and pm.member_id = tasks.assignee_id
  )
);

create policy "tasks_personal_owner"
on public.tasks
for select
to authenticated
using (is_personal = true and assignee_id = auth.uid());

create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    is_personal = true
    or public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
    or public.current_user_department() = department_id
  )
);

create policy "tasks_update_delete"
on public.tasks
for all
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
)
with check (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
);

create policy "task_comments_select_related"
on public.task_comments
for select
to authenticated
using (
  exists (
    select 1 from public.tasks
    where tasks.id = task_comments.task_id
  )
);

create policy "task_comments_write_related"
on public.task_comments
for all
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "goals_select_hierarchy"
on public.goals
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or department_id = public.current_user_department()
  or owner_id = auth.uid()
);

create policy "goals_write_leads"
on public.goals
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or owner_id = auth.uid()
)
with check (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or owner_id = auth.uid()
);

create policy "meetings_select_hierarchy"
on public.meetings
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or department_id = public.current_user_department()
  or created_by = auth.uid()
);

create policy "meetings_write_leads"
on public.meetings
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or created_by = auth.uid()
)
with check (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or created_by = auth.uid()
);

create policy "meeting_attendance_select_hierarchy"
on public.meeting_attendance
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.meetings
    where meetings.id = meeting_attendance.meeting_id
      and meetings.department_id = public.current_user_department()
  )
);

create policy "meeting_attendance_write_leads"
on public.meeting_attendance
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.meetings
    where meetings.id = meeting_attendance.meeting_id
      and meetings.department_id = public.current_user_department()
      and public.current_user_role() = 'dept_lead'
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.meetings
    where meetings.id = meeting_attendance.meeting_id
      and meetings.department_id = public.current_user_department()
      and public.current_user_role() = 'dept_lead'
  )
);

create policy "automations_select_hierarchy"
on public.automations
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or department_id = public.current_user_department()
  or created_by = auth.uid()
);

create policy "automations_write_admin_lead"
on public.automations
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
)
with check (
  public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
);

create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'super_admin'
);

create policy "notifications_write_admin"
on public.notifications
for all
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'super_admin')
with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "activity_log_select_scope"
on public.activity_log
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'super_admin'
);

create policy "activity_log_insert_authenticated"
on public.activity_log
for insert
to authenticated
with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "user_notification_prefs_select_own"
on public.user_notification_prefs
for select
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "user_notification_prefs_write_own"
on public.user_notification_prefs
for all
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'super_admin')
with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');
