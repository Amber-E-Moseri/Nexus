-- ============================================================
-- PHASE 6 - API KEYS + AUTOMATIONS
-- ============================================================

alter table public.tasks
  add column if not exists source_name text,
  add column if not exists source_type text,
  add column if not exists external_unique_key text;

alter table public.tasks
  drop constraint if exists tasks_source_check;

alter table public.tasks
  add constraint tasks_source_check
  check (source in ('manual', 'meeting', 'automation', 'admin_processor', 'zoom', 'api', 'integration'));

create unique index if not exists tasks_external_unique_key_idx
  on public.tasks (external_unique_key)
  where external_unique_key is not null;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  department_id uuid references public.departments(id) on delete cascade,
  sprint_id uuid references public.sprints(id) on delete cascade,
  permissions jsonb not null default '["tasks:write","tasks:read"]'::jsonb,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint api_keys_scope_check check (department_id is not null or sprint_id is not null)
);

create index if not exists api_keys_hash_idx on public.api_keys(key_hash);
create index if not exists api_keys_dept_idx on public.api_keys(department_id);
create index if not exists api_keys_sprint_idx on public.api_keys(sprint_id);

alter table public.automations
  add column if not exists description text,
  add column if not exists sprint_id uuid references public.sprints(id) on delete cascade,
  add column if not exists trigger_config jsonb not null default '{}'::jsonb,
  add column if not exists last_fired_at timestamptz,
  add column if not exists fire_count integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'automations'
      and column_name = 'last_fired'
  ) then
    update public.automations
    set last_fired_at = coalesce(last_fired_at, last_fired)
    where last_fired is not null;
  end if;
end $$;

alter table public.automations
  alter column conditions set default '[]'::jsonb,
  alter column actions set default '[]'::jsonb;

update public.automations
set conditions = '[]'::jsonb
where jsonb_typeof(conditions) <> 'array';

update public.automations
set actions = '[]'::jsonb
where jsonb_typeof(actions) <> 'array';

create index if not exists automations_dept_idx on public.automations(department_id);
create index if not exists automations_sprint_idx on public.automations(sprint_id);
create index if not exists automations_enabled_idx on public.automations(enabled);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger_payload jsonb not null default '{}'::jsonb,
  actions_taken jsonb not null default '[]'::jsonb,
  status text not null default 'success'
    check (status in ('success', 'partial', 'failed')),
  error text,
  duration_ms integer,
  ran_at timestamptz not null default now()
);

create index if not exists automation_runs_automation_idx on public.automation_runs(automation_id);
create index if not exists automation_runs_ran_at_idx on public.automation_runs(ran_at desc);

alter table public.api_keys enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "api_keys_select" on public.api_keys;
create policy "api_keys_select"
on public.api_keys
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
  )
  or created_by = auth.uid()
);

drop policy if exists "api_keys_write" on public.api_keys;
create policy "api_keys_write"
on public.api_keys
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
    and sprint_id is null
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
    and sprint_id is null
  )
);

drop policy if exists "automations_select_hierarchy" on public.automations;
drop policy if exists "automations_select" on public.automations;
create policy "automations_select"
on public.automations
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
  )
  or (
    sprint_id is not null
    and exists (
      select 1
      from public.sprint_members sm
      where sm.sprint_id = automations.sprint_id
        and sm.user_id = auth.uid()
    )
  )
);

drop policy if exists "automations_write_admin_lead" on public.automations;
drop policy if exists "automations_write" on public.automations;
create policy "automations_write"
on public.automations
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
    and sprint_id is null
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
    and sprint_id is null
  )
);

drop policy if exists "automation_runs_select" on public.automation_runs;
create policy "automation_runs_select"
on public.automation_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.automations a
    where a.id = automation_runs.automation_id
      and (
        public.current_user_role() = 'super_admin'
        or (
          public.current_user_role() = 'dept_lead'
          and a.department_id = public.current_user_department()
        )
        or (
          a.sprint_id is not null
          and exists (
            select 1
            from public.sprint_members sm
            where sm.sprint_id = a.sprint_id
              and sm.user_id = auth.uid()
          )
        )
      )
  )
);
