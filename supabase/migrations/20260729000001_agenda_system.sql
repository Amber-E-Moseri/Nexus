-- Agenda system tables and functions

-- Create agenda_templates table (for reusable meeting templates)
create table if not exists public.agenda_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  meeting_type text not null, -- 'sunday_service', 'regional_meeting', 'dream_team', 'ors_meeting', 'blank'
  items jsonb not null default '[]'::jsonb, -- array of {segment, notes, duration, isPinned}
  department_id uuid references public.departments(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agenda_templates_department on public.agenda_templates(department_id);
create index if not exists idx_agenda_templates_meeting_type on public.agenda_templates(meeting_type);

-- Create agendas table (stores meeting agendas)
create table if not exists public.agendas (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete set null,
  title text not null,
  meeting_type text not null, -- 'sunday_service', 'regional_meeting', etc.
  department_id uuid not null references public.departments(id) on delete cascade,
  date date,
  start_time time,
  end_time time,
  location text,
  moderator_name text,
  moderator_id uuid references public.users(id) on delete set null,
  theme text not null default 'cream_purple', -- 'cream_purple', 'blue', 'forest', 'coral'
  template_id uuid references public.agenda_templates(id) on delete set null,
  created_by uuid not null references public.users(id) on delete cascade,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agendas_department on public.agendas(department_id);
create index if not exists idx_agendas_meeting on public.agendas(meeting_id);
create index if not exists idx_agendas_created_by on public.agendas(created_by);
create index if not exists idx_agendas_date on public.agendas(date);

-- Create agenda_items table (individual items in an agenda)
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid not null references public.agendas(id) on delete cascade,
  segment text not null,
  notes text,
  duration_minutes integer not null default 15,
  sort_order integer not null default 0,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agenda_items_agenda on public.agenda_items(agenda_id);
create index if not exists idx_agenda_items_sort_order on public.agenda_items(agenda_id, sort_order);

-- RPC function to calculate agenda timings
create or replace function public.calculate_agenda_timings(
  p_start_time time,
  p_durations integer[]
)
returns table (
  item_index integer,
  start_time text,
  end_time text,
  running_minutes integer
)
language plpgsql
as $$
declare
  v_current_time interval;
  v_index integer := 0;
  v_duration integer;
  v_cumulative integer := 0;
begin
  v_current_time := p_start_time::interval;

  foreach v_duration in array p_durations
  loop
    item_index := v_index;
    start_time := (('00:00:00'::time + v_current_time))::text;
    v_current_time := v_current_time + (v_duration || ' minutes')::interval;
    end_time := (('00:00:00'::time + v_current_time))::text;
    v_cumulative := v_cumulative + v_duration;
    running_minutes := v_cumulative;

    return next;

    v_index := v_index + 1;
  end loop;
end;
$$;

-- Enable RLS on all tables
alter table public.agenda_templates enable row level security;
alter table public.agendas enable row level security;
alter table public.agenda_items enable row level security;

-- RLS Policies for agenda_templates
create policy "agenda_templates_select"
  on public.agenda_templates for select
  to authenticated
  using (
    is_default = true
    or department_id = (select department_id from public.users where id = auth.uid())
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

create policy "agenda_templates_insert"
  on public.agenda_templates for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (select role from public.users where id = auth.uid()) in ('super_admin', 'dept_lead')
      or department_id = (select department_id from public.users where id = auth.uid())
    )
  );

create policy "agenda_templates_update"
  on public.agenda_templates for update
  to authenticated
  using (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  )
  with check (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

-- RLS Policies for agendas
create policy "agendas_select"
  on public.agendas for select
  to authenticated
  using (
    created_by = auth.uid()
    or department_id = (select department_id from public.users where id = auth.uid())
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

create policy "agendas_insert"
  on public.agendas for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (select role from public.users where id = auth.uid()) in ('super_admin', 'dept_lead', 'pastor')
    )
  );

create policy "agendas_update"
  on public.agendas for update
  to authenticated
  using (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  )
  with check (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

create policy "agendas_delete"
  on public.agendas for delete
  to authenticated
  using (
    created_by = auth.uid()
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

-- RLS Policies for agenda_items (inherit from parent agenda)
create policy "agenda_items_select"
  on public.agenda_items for select
  to authenticated
  using (
    exists (
      select 1 from public.agendas
      where agendas.id = agenda_items.agenda_id
      and (
        agendas.created_by = auth.uid()
        or agendas.department_id = (select department_id from public.users where id = auth.uid())
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

create policy "agenda_items_insert"
  on public.agenda_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.agendas
      where agendas.id = agenda_items.agenda_id
      and (
        agendas.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

create policy "agenda_items_update"
  on public.agenda_items for update
  to authenticated
  using (
    exists (
      select 1 from public.agendas
      where agendas.id = agenda_items.agenda_id
      and (
        agendas.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  )
  with check (
    exists (
      select 1 from public.agendas
      where agendas.id = agenda_items.agenda_id
      and (
        agendas.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

create policy "agenda_items_delete"
  on public.agenda_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.agendas
      where agendas.id = agenda_items.agenda_id
      and (
        agendas.created_by = auth.uid()
        or (select role from public.users where id = auth.uid()) = 'super_admin'
      )
    )
  );

-- Seed default built-in templates
insert into public.agenda_templates (name, description, meeting_type, items, is_default, created_by)
values
  (
    'Sunday Service',
    'Typical Sunday worship service agenda',
    'sunday_service',
    '[
      {"segment": "Intro Music", "notes": "Instrumental worship", "duration": 15, "isPinned": true},
      {"segment": "Welcome & Prayer", "notes": "Greet attendees, opening prayer", "duration": 10},
      {"segment": "Worship", "notes": "Led worship songs", "duration": 25},
      {"segment": "Message", "notes": "Main sermon/teaching", "duration": 40},
      {"segment": "Altar Call", "notes": "Response time, prayer", "duration": 10},
      {"segment": "Closing Prayer", "notes": "Final prayer and dismissal", "duration": 5}
    ]'::jsonb,
    true,
    null
  ),
  (
    'Regional Meeting',
    'Regional coordination and updates',
    'regional_meeting',
    '[
      {"segment": "Welcome", "notes": "Brief welcome and agenda overview", "duration": 5},
      {"segment": "Regional Updates", "notes": "Leadership updates and announcements", "duration": 20},
      {"segment": "Key Topics", "notes": "Discussion of regional priorities", "duration": 30},
      {"segment": "Q&A", "notes": "Questions from attendees", "duration": 15},
      {"segment": "Action Items Review", "notes": "Confirm deliverables and owners", "duration": 10},
      {"segment": "Closing", "notes": "Prayer and closing remarks", "duration": 5}
    ]'::jsonb,
    true,
    null
  ),
  (
    'Dream Team Meeting',
    'Leadership/visioning team meeting',
    'dream_team',
    '[
      {"segment": "Icebreaker", "notes": "Team connection activity", "duration": 10},
      {"segment": "Vision Review", "notes": "Review goals and progress", "duration": 20},
      {"segment": "Blockers Discussion", "notes": "Address challenges and obstacles", "duration": 20},
      {"segment": "Strategic Planning", "notes": "Plan next steps and initiatives", "duration": 30},
      {"segment": "Accountability", "notes": "Set targets and commitments", "duration": 15},
      {"segment": "Prayer & Closing", "notes": "Team prayer and closing", "duration": 5}
    ]'::jsonb,
    true,
    null
  ),
  (
    'ORS Meeting',
    'Operations and Reports Sync',
    'ors_meeting',
    '[
      {"segment": "Opening & Welcome", "notes": "Agenda and objectives overview", "duration": 5},
      {"segment": "Department Reports", "notes": "Each team shares updates and metrics", "duration": 25},
      {"segment": "Discussion & Q&A", "notes": "Open discussion of reports", "duration": 20},
      {"segment": "Key Decisions", "notes": "Decisions requiring team input", "duration": 15},
      {"segment": "Action Items", "notes": "Confirm deliverables and timelines", "duration": 10},
      {"segment": "Closing Remarks", "notes": "Final thoughts and dismissal", "duration": 5}
    ]'::jsonb,
    true,
    null
  )
on conflict do nothing;
