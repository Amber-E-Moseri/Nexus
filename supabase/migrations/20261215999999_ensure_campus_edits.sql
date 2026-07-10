-- Recreate campus_edits on remotes where it never actually applied.
-- The original 20260625000011_campus_edits_table.sql predates the campuses
-- table it references (created 20261001000006), so it could never run in
-- order; its ledger entry was repaired in without the SQL executing. The
-- phase-3 RLS swap (20261216000000) assumes this table exists.
-- Idempotent: safe where the table already exists.

create table if not exists public.campus_edits (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  field_name text not null,
    -- Allowed fields: name, institution, campus_name_alt, latitude, longitude, spotify_playlist_id
  old_value text,
  new_value text not null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamp with time zone default now(),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_campus_edits_status on public.campus_edits(status);
create index if not exists idx_campus_edits_campus_id on public.campus_edits(campus_id);
create index if not exists idx_campus_edits_submitted_by on public.campus_edits(submitted_by);

alter table public.campus_edits enable row level security;

-- Base policies from the original migration; the phase-3 RLS swap replaces
-- them immediately after this runs.
drop policy if exists "campus_edits_select_own_or_admin" on public.campus_edits;
create policy "campus_edits_select_own_or_admin"
on public.campus_edits
for select
to authenticated
using (
  auth.uid() = submitted_by
  or (select role from public.users where id = auth.uid()) in ('super_admin', 'ors')
);

drop policy if exists "campus_edits_insert_authenticated" on public.campus_edits;
create policy "campus_edits_insert_authenticated"
on public.campus_edits
for insert
to authenticated
with check (auth.uid() = submitted_by);

drop policy if exists "campus_edits_update_admin_only" on public.campus_edits;
create policy "campus_edits_update_admin_only"
on public.campus_edits
for update
to authenticated
using ((select role from public.users where id = auth.uid()) in ('super_admin', 'ors'));
