-- Configurable tag definitions for ICPLC (not hard-coded in a CHECK constraint).
-- Tags represent flexible operational concerns (Finances, School, Travel Cost, etc.).
-- They are NOT a Finance Follow-up workflow — they are general operational metadata.

create table public.icplc_tags (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid, -- FK to event_configs deferred; added by forward convergence 20270807000012
  -- null event_id = org-wide default (visible across all ICPLC events)
  name       text not null,
  color      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(event_id, name)
);

-- Default org-wide tags (event_id = null → no FK value).
insert into public.icplc_tags (name, sort_order) values
  ('Finances',        1),
  ('School',          2),
  ('Parental/Family', 3),
  ('Work',            4),
  ('Travel Cost',     5),
  ('Needs Follow-up', 6),
  ('Personal/Other',  7);

-- Junction: which tags are applied to which participants.
create table public.icplc_participant_tags (
  participant_id uuid not null references public.icplc_participants(id) on delete cascade,
  tag_id         uuid not null references public.icplc_tags(id) on delete cascade,
  added_by       uuid references public.users(id) on delete set null,
  added_at       timestamptz not null default now(),
  primary key (participant_id, tag_id)
);

alter table public.icplc_tags enable row level security;
alter table public.icplc_participant_tags enable row level security;

-- Tags readable by anyone who can read participants.
create policy "icplc_tags_read"
  on public.icplc_tags for select to authenticated
  using (public.icplc_can_read_participants());

-- Tag definitions managed only by super_admin / regional_secretary (Settings page).
create policy "icplc_tags_write"
  on public.icplc_tags for all to authenticated
  using (public.current_user_role() in ('super_admin', 'regional_secretary'))
  with check (public.current_user_role() in ('super_admin', 'regional_secretary'));

-- Participant tag assignments follow participant write gates.
create policy "icplc_participant_tags_read"
  on public.icplc_participant_tags for select to authenticated
  using (public.icplc_can_read_participants());

create policy "icplc_participant_tags_write"
  on public.icplc_participant_tags for all to authenticated
  using (public.icplc_can_write_participants())
  with check (public.icplc_can_write_participants());
