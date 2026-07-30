-- working_list: synced from the "Working List" tab in the registration
-- Google Sheet. Separate from roster (all members) and registrations
-- (form submissions) — this is a curated list of expected attendees
-- with their leadership category.

create table if not exists public.working_list (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null default '',
  subgroup      text not null default '',
  leadership_category text not null default '',
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table public.working_list enable row level security;

-- All authenticated users with registration access can read
create policy "working_list_select"
on public.working_list for select to authenticated using (true);

-- Only service role writes (via edge function)
create policy "working_list_service_insert"
on public.working_list for insert to service_role with check (true);

create policy "working_list_service_update"
on public.working_list for update to service_role using (true);

create policy "working_list_service_delete"
on public.working_list for delete to service_role using (true);

create index if not exists working_list_email_idx on public.working_list (email);
create index if not exists working_list_subgroup_idx on public.working_list (subgroup);
