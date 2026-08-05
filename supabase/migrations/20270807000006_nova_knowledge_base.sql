-- Nova AI Assistant: knowledge base + query log tables

create table public.nova_kb_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  question text not null,
  answer text not null,
  feature_area text not null,
  applicable_roles text[] not null,
  source_docs text[],
  status text not null default 'active' check (status in ('active', 'needs_review', 'archived')),
  last_reviewed_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table public.nova_query_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  question text not null,
  track text not null check (track in ('kb', 'live_data', 'unanswered')),
  kb_entries_used uuid[],
  tool_calls_made text[],
  feedback text check (feedback in ('up', 'down', null)),
  created_at timestamptz not null default now()
);

alter table public.nova_kb_entries enable row level security;
alter table public.nova_query_log enable row level security;

-- KB entries: active entries visible to users whose role is in applicable_roles
create policy nova_kb_read on public.nova_kb_entries
  for select using (
    status = 'active'
    and (select current_user_role()) = any(applicable_roles)
  );

-- KB write: dept_lead and above can create/update/delete entries
create policy nova_kb_write on public.nova_kb_entries
  for all using (
    (select current_user_role()) in ('super_admin', 'regional_secretary', 'dept_lead')
  );

-- Query log: users see only their own rows; super_admin and regional_secretary
-- see all (they're the two roles who staff the Nova review view — section 6).
create policy nova_log_own_select on public.nova_query_log
  for select using (
    user_id = (select auth.uid())
    or (select current_user_role()) in ('super_admin', 'regional_secretary')
  );

create policy nova_log_insert on public.nova_query_log
  for insert with check (
    user_id = (select auth.uid())
  );

-- Allow users to record thumbs up/down on their own log rows
create policy nova_log_update_feedback on public.nova_query_log
  for update using (
    user_id = (select auth.uid())
  ) with check (
    user_id = (select auth.uid())
  );

-- updated_at trigger for nova_kb_entries
create or replace function public.set_nova_kb_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nova_kb_updated_at
  before update on public.nova_kb_entries
  for each row execute function public.set_nova_kb_updated_at();
