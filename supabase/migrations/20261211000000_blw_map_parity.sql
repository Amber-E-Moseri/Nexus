-- BLW CAN Map — feature parity with the standalone map app.
--
-- The routed Supabase map (src/components/map/BLWMap.jsx) only tracked a bare
-- active/inactive status. Bringing it to parity with the original standalone
-- app requires the richer per-campus record the original carried, plus the two
-- prayer tables the (previously orphaned) campus detail components already
-- expect to read/write.
--
-- Each addition below is tied to a specific parity feature; nothing speculative.

-- ── 1. Rich campus record columns ────────────────────────────────────────────
-- Feature: Info/Notes/Prayer/Edit side-panel tabs (contact, notes, strategy,
-- prayer points/notes, coverage plan) and needs-plan coverage workflow.
alter table public.campuses
  add column if not exists province      text,
  add column if not exists subgroup      text,
  add column if not exists contact_name  text,
  add column if not exists contact_phone text,
  add column if not exists notes         text,
  add column if not exists strategy      text,
  add column if not exists prayer_points jsonb not null default '[]'::jsonb,
  add column if not exists prayer_notes  text,
  add column if not exists coverage_plan text,
  add column if not exists custom_photo  text;

-- Feature: 4-status reach model (Established / Pioneering / Influenced /
-- Not Reached). The original defaults new campuses to "Not Reached".
alter table public.campuses
  alter column status set default 'Not Reached';

-- Map the two legacy values onto the new reach vocabulary so existing rows
-- render under the new legend. Only touches rows still using the old values.
update public.campuses set status = 'Established Fellowship' where status = 'active';
update public.campuses set status = 'Not Reached'            where status = 'inactive';

-- ── 2. prayer_logs ───────────────────────────────────────────────────────────
-- Feature: Prayer Activity tab + PrayerTimer (logged prayer sessions per campus).
create table if not exists public.prayer_logs (
  id               uuid primary key default gen_random_uuid(),
  campus_id        uuid not null references public.campuses(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  duration_seconds integer not null check (duration_seconds >= 0),
  logged_at        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_prayer_logs_campus_id on public.prayer_logs(campus_id);
create index if not exists idx_prayer_logs_logged_at on public.prayer_logs(logged_at);

alter table public.prayer_logs enable row level security;

create policy "prayer_logs_select_all"
  on public.prayer_logs for select
  to authenticated
  using (true);

create policy "prayer_logs_insert_own"
  on public.prayer_logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "prayer_logs_delete_own_or_admin"
  on public.prayer_logs for delete
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('super_admin', 'ors'));

-- ── 3. prayer_requests ───────────────────────────────────────────────────────
-- Feature: Prayer Requests tab (create / resolve / delete intercession requests).
create table if not exists public.prayer_requests (
  id          uuid primary key default gen_random_uuid(),
  campus_id   uuid not null references public.campuses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_prayer_requests_campus_id on public.prayer_requests(campus_id);
create index if not exists idx_prayer_requests_resolved  on public.prayer_requests(resolved_at);

alter table public.prayer_requests enable row level security;

create policy "prayer_requests_select_all"
  on public.prayer_requests for select
  to authenticated
  using (true);

create policy "prayer_requests_insert_own"
  on public.prayer_requests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "prayer_requests_update_own_or_admin"
  on public.prayer_requests for update
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('super_admin', 'ors'));

create policy "prayer_requests_delete_own_or_admin"
  on public.prayer_requests for delete
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() in ('super_admin', 'ors'));

-- ── 4. Realtime ──────────────────────────────────────────────────────────────
-- The campus detail modal subscribes to live inserts/updates on both tables.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.prayer_logs;
    alter publication supabase_realtime add table public.prayer_requests;
  end if;
exception
  when duplicate_object then null;
end $$;
