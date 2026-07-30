-- Roster table for "This Is It 2.0" registration tracking
-- Synced from Google Sheets via AppScript; used by Working List view

create table if not exists public.roster (
  id                bigserial primary key,
  email             text not null unique,
  first_name        text default '',
  last_name         text default '',
  full_name         text,
  subgroup          text,
  leadership        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.roster enable row level security;

-- Anyone authenticated can read roster (page gates non-permitted users)
create policy "Authenticated users can read roster"
  on public.roster for select
  using (auth.uid() is not null);

-- Sync function (service-role only) can insert/update
create policy "Service role can manage roster"
  on public.roster for all
  using (current_user_role() = 'service_role');

create index idx_roster_email on public.roster (email);
create index idx_roster_subgroup on public.roster (subgroup);
