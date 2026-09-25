-- ICPLC Participant table.
-- These are the canonical operational profiles for ICPLC; they have nothing to do
-- with the TII registrations/roster/working_list tables (which are globally unscoped
-- and belong entirely to This Is It).
--
-- RLS Option A: capability derived from sprint team membership at query time.
-- No user_grants rows are provisioned by the frontend.

-- Helper: can the current user read icplc_participants?
-- Grants access to all ICPLC sprint team members except Finance (Finance tab only).
create or replace function public.icplc_can_read_participants()
  returns boolean language sql security definer stable as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s    on s.name ilike ec.sprint_pattern
        join public.sprint_teams st  on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
      )
    )
  $$;

-- Helper: can the current user write icplc_participants?
-- Same as read but also excludes Transportation (scoped_view_reg = read-only tier).
create or replace function public.icplc_can_write_participants()
  returns boolean language sql security definer stable as $$
    select (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or exists (
        select 1
        from public.event_configs ec
        join public.sprints s    on s.name ilike ec.sprint_pattern
        join public.sprint_teams st  on st.sprint_id = s.id
        join public.sprint_team_members stm on stm.team_id = st.id
        where ec.event_name ilike '%ICPLC%'
          and stm.user_id = auth.uid()
          and st.name not ilike '%Finance%'
          and st.name not ilike '%Transportation%'
      )
    )
  $$;

-- Main participant table.
create table public.icplc_participants (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.event_configs(id) on delete restrict,
  full_name               text not null,
  email                   text,
  region                  text,
  subgroup                text,
  group_name              text,
  leadership              text,
  notes                   text,

  -- Staff-managed (never from import)
  participation_status    text not null default 'tracking'
    check (participation_status in ('tracking','likely','confirmed','uncertain','not_attending')),

  -- Source-backed (importable with field-level override protection)
  registration_status     text not null default 'unknown'
    check (registration_status in ('unknown','not_registered','registered','issue')),
  canada_residency_status text,
  passport_country        text,
  passport_readiness      text not null default 'unknown'
    check (passport_readiness in
      ('unknown','ready','renewal_needed','renewal_in_progress','no_passport','unsure','issue')),
  visa_requirement        text not null default 'review'
    check (visa_requirement in ('required','not_required','review')),
  visa_process_status     text not null default 'not_started'
    check (visa_process_status in
      ('not_started','in_progress','submitted','processing','approved','issue','not_applicable')),

  -- Flight data (importable)
  arrival_date            date,
  arrival_time            text,
  arrival_flight          text,
  departure_date          date,
  departure_time          text,
  departure_flight        text,

  -- NOT STORED: itinerary_status, travel_status, readiness — all derived on read

  -- Field-level override metadata (JSONB per field).
  -- Format: { "registration_status": { "overridden": true, "by": "<user-uuid>", "at": "<iso>" }, ... }
  override_fields         jsonb not null default '{}',

  -- Source provenance per field.
  -- Format: { "registration_status": { "value": "registered", "source": "csv",
  --            "observed_at": "<iso>", "batch_id": "<uuid>" }, ... }
  -- Special key "participation_reference": stores CSV "Participation" value as
  -- read-only metadata; it never maps to participation_status.
  source_values           jsonb not null default '{}',

  nexus_user_id           uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Prevent duplicate email within the same event (nulls are excluded).
create unique index icplc_participants_event_email_idx
  on public.icplc_participants(event_id, email)
  where email is not null;

create trigger icplc_participants_updated_at
  before update on public.icplc_participants
  for each row execute procedure public.set_updated_at();

alter table public.icplc_participants enable row level security;

create policy "icplc_participants_read"
  on public.icplc_participants for select to authenticated
  using (public.icplc_can_read_participants());

create policy "icplc_participants_write"
  on public.icplc_participants for all to authenticated
  using (public.icplc_can_write_participants())
  with check (public.icplc_can_write_participants());
