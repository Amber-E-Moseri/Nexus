-- ─────────────────────────────────────────────────────────────────────────────
-- Attendance Trends system
--
-- NOTE: public.meetings / public.meeting_attendance already exist for the
-- Meeting OS feature (department meetings, minutes, agenda). This is a
-- separate concept (attendance-tracking against subgroups/groups/roles), so
-- distinct table names are used to avoid collision:
--   attendance_groups, attendance_subgroups, attendance_meetings,
--   attendance_members, attendance_records
--
-- Attendance rate definition used throughout this file:
--   rate% = (present + late) / (present + absent + late + excused) * 100
-- "late" counts as attended; "excused" counts as a recorded absence that
-- does not count against the member (excluded from numerator, included in
-- denominator) — adjust if BLW Canada wants excused fully excluded.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Lookup tables ──────────────────────────────────────────────────────────

create table if not exists public.attendance_groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.attendance_subgroups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  group_id    uuid        references public.attendance_groups(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (name, group_id)
);

-- ─── Core tables ────────────────────────────────────────────────────────────

create table if not exists public.attendance_meetings (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  type            text        not null
    check (type in ('north_american', 'regional', 'staff', 'sub_group', 'group', 'special')),
  date            date        not null,
  subgroup_id     uuid        references public.attendance_subgroups(id) on delete set null,
  group_id        uuid        references public.attendance_groups(id) on delete set null,
  expected_count  integer     not null default 0,
  created_by      uuid        references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.attendance_members (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  role        text        not null
    check (role in ('cell_leader', 'bsc_teacher', 'coordinator', 'leader_in_training', 'leader')),
  subgroup_id uuid        references public.attendance_subgroups(id) on delete set null,
  group_id    uuid        references public.attendance_groups(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id              uuid        primary key default gen_random_uuid(),
  meeting_id      uuid        not null references public.attendance_meetings(id) on delete cascade,
  member_id       uuid        not null references public.attendance_members(id) on delete cascade,
  status          text        not null
    check (status in ('present', 'absent', 'late', 'excused')),
  check_in_time   timestamptz,
  recorded_by     uuid        references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (meeting_id, member_id)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index if not exists attendance_meetings_date_idx        on public.attendance_meetings (date);
create index if not exists attendance_meetings_type_date_idx   on public.attendance_meetings (type, date);
create index if not exists attendance_meetings_subgroup_idx    on public.attendance_meetings (subgroup_id, date);
create index if not exists attendance_records_member_idx       on public.attendance_records (member_id, created_at);
create index if not exists attendance_records_meeting_idx      on public.attendance_records (meeting_id);
create index if not exists attendance_members_subgroup_idx     on public.attendance_members (subgroup_id);
create index if not exists attendance_members_role_idx         on public.attendance_members (role);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.attendance_groups    enable row level security;
alter table public.attendance_subgroups enable row level security;
alter table public.attendance_meetings  enable row level security;
alter table public.attendance_members   enable row level security;
alter table public.attendance_records   enable row level security;

create policy "authenticated can read attendance_groups"    on public.attendance_groups    for select using (auth.role() = 'authenticated');
create policy "authenticated can read attendance_subgroups" on public.attendance_subgroups for select using (auth.role() = 'authenticated');
create policy "authenticated can read attendance_meetings"  on public.attendance_meetings  for select using (auth.role() = 'authenticated');
create policy "authenticated can read attendance_members"   on public.attendance_members   for select using (auth.role() = 'authenticated');
create policy "authenticated can read attendance_records"   on public.attendance_records   for select using (auth.role() = 'authenticated');

create policy "admins can write attendance_groups" on public.attendance_groups
  for all using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can write attendance_subgroups" on public.attendance_subgroups
  for all using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can write attendance_meetings" on public.attendance_meetings
  for all using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can write attendance_members" on public.attendance_members
  for all using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));

create policy "admins can write attendance_records" on public.attendance_records
  for all using (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'))
  with check (auth.jwt() ->> 'user_role' in ('super_admin', 'dept_lead'));


-- ═════════════════════════════════════════════════════════════════════════════
-- INSIGHT QUERIES (RPC functions)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. get_member_attendance_rate(member_id, period) ─────────────────────────
-- period: 'month' | 'quarter'
-- Returns one row per bucket the member has records in, most recent first.
create or replace function public.get_member_attendance_rate(
  p_member_id uuid,
  p_period    text default 'month'
)
returns table (
  period_label   text,
  period_start   date,
  total_meetings integer,
  attended       integer,
  rate_pct       numeric
)
language sql
stable
as $$
  with bucketed as (
    select
      date_trunc(case when p_period = 'quarter' then 'quarter' else 'month' end, m.date)::date as bucket,
      r.status
    from public.attendance_records r
    join public.attendance_meetings m on m.id = r.meeting_id
    where r.member_id = p_member_id
  )
  select
    to_char(bucket, case when p_period = 'quarter' then '"Q"Q YYYY' else 'Mon YYYY' end) as period_label,
    bucket as period_start,
    count(*)::int as total_meetings,
    count(*) filter (where status in ('present', 'late'))::int as attended,
    round(
      100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0),
      1
    ) as rate_pct
  from bucketed
  group by bucket
  order by bucket desc;
$$;

-- ─── 2. get_consecutive_absences(subgroup_id) ──────────────────────────────────
-- Flags members currently on a streak of 2+ consecutive absences (most recent
-- meetings first). A streak is broken by any present/late/excused record.
create or replace function public.get_consecutive_absences(
  p_subgroup_id uuid default null
)
returns table (
  member_id              uuid,
  member_name            text,
  role                   text,
  subgroup_id            uuid,
  consecutive_absences   integer,
  last_meeting_date      date
)
language sql
stable
as $$
  with ordered as (
    select
      r.member_id,
      m.date,
      r.status,
      row_number() over (partition by r.member_id order by m.date desc) as rn,
      -- marks the first non-absent record walking backward from most recent;
      -- everything before that boundary (rn < boundary) is part of the
      -- current absence streak
      min(case when r.status <> 'absent' then row_number() over (partition by r.member_id order by m.date desc) end)
        over (partition by r.member_id) as first_break_rn
    from public.attendance_records r
    join public.attendance_meetings m on m.id = r.meeting_id
  ),
  streaks as (
    select
      member_id,
      count(*) filter (where rn < coalesce(first_break_rn, 2147483647))::int as consecutive_absences,
      max(date) as last_meeting_date
    from ordered
    group by member_id
  )
  select
    s.member_id,
    am.name as member_name,
    am.role,
    am.subgroup_id,
    s.consecutive_absences,
    s.last_meeting_date
  from streaks s
  join public.attendance_members am on am.id = s.member_id
  where s.consecutive_absences >= 2
    and (p_subgroup_id is null or am.subgroup_id = p_subgroup_id)
  order by s.consecutive_absences desc, s.last_meeting_date desc;
$$;

-- ─── 3. get_subgroup_ranking(meeting_type, period) ─────────────────────────────
-- period: 'month' | 'quarter' | 'year' | 'all' — bucket relative to today.
-- Ranks subgroups by attendance % within a single meeting type only
-- (no cross-meeting-type comparison, per spec).
create or replace function public.get_subgroup_ranking(
  p_meeting_type text,
  p_period       text default 'month'
)
returns table (
  subgroup_id     uuid,
  subgroup_name   text,
  total_meetings  integer,
  attendance_pct  numeric,
  rank            integer
)
language sql
stable
as $$
  with bounds as (
    select case p_period
      when 'quarter' then date_trunc('quarter', current_date)
      when 'year'    then date_trunc('year', current_date)
      when 'all'     then '0001-01-01'::date
      else date_trunc('month', current_date)
    end as start_date
  ),
  scoped as (
    select r.status, m.subgroup_id
    from public.attendance_records r
    join public.attendance_meetings m on m.id = r.meeting_id
    cross join bounds b
    where m.type = p_meeting_type
      and m.date >= b.start_date
  ),
  agg as (
    select
      subgroup_id,
      count(*)::int as total_meetings,
      round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1) as attendance_pct
    from scoped
    group by subgroup_id
  )
  select
    a.subgroup_id,
    sg.name as subgroup_name,
    a.total_meetings,
    a.attendance_pct,
    rank() over (order by a.attendance_pct desc)::int as rank
  from agg a
  join public.attendance_subgroups sg on sg.id = a.subgroup_id
  order by rank;
$$;

-- ─── 4. get_role_attendance_breakdown(meeting_id) ──────────────────────────────
create or replace function public.get_role_attendance_breakdown(
  p_meeting_id uuid
)
returns table (
  role           text,
  total_members  integer,
  present_count  integer,
  attendance_pct numeric
)
language sql
stable
as $$
  select
    am.role,
    count(*)::int as total_members,
    count(*) filter (where r.status in ('present', 'late'))::int as present_count,
    round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*), 0), 1) as attendance_pct
  from public.attendance_records r
  join public.attendance_members am on am.id = r.member_id
  where r.meeting_id = p_meeting_id
  group by am.role
  order by attendance_pct desc;
$$;

-- ─── 5. get_lit_dropout_rate(period) ────────────────────────────────────────
-- Leaders in Training who attended (present/late) in at least one of their
-- first 3 recorded meetings, but have zero present/late records within the
-- trailing period ('month' | 'quarter').
create or replace function public.get_lit_dropout_rate(
  p_period text default 'quarter'
)
returns table (
  total_lit       integer,
  active_lit      integer,
  dropped_lit     integer,
  dropout_pct     numeric,
  member_id       uuid,
  member_name     text,
  first_attended  date,
  last_attended   date
)
language sql
stable
as $$
  with bounds as (
    select case p_period
      when 'month' then date_trunc('month', current_date)
      else date_trunc('quarter', current_date)
    end as cutoff
  ),
  lit as (
    select id, name from public.attendance_members where role = 'leader_in_training'
  ),
  member_records as (
    select
      l.id as member_id,
      l.name as member_name,
      m.date,
      r.status,
      row_number() over (partition by l.id order by m.date asc) as seq_asc
    from lit l
    join public.attendance_records r on r.member_id = l.id
    join public.attendance_meetings m on m.id = r.meeting_id
  ),
  early_attendance as (
    select member_id, bool_or(status in ('present', 'late')) as attended_early
    from member_records
    where seq_asc <= 3
    group by member_id
  ),
  recent_attendance as (
    select mr.member_id, bool_or(mr.status in ('present', 'late')) as attended_recent,
           max(mr.date) filter (where mr.status in ('present','late')) as last_attended,
           min(mr.date) filter (where mr.status in ('present','late')) as first_attended
    from member_records mr
    group by mr.member_id
  ),
  classified as (
    select
      e.member_id,
      ra.first_attended,
      ra.last_attended,
      (e.attended_early and not coalesce(
        (select bool_or(status in ('present','late'))
         from member_records mr2, bounds b
         where mr2.member_id = e.member_id and mr2.date >= b.cutoff),
        false
      )) as dropped
    from early_attendance e
    join recent_attendance ra on ra.member_id = e.member_id
    where e.attended_early
  )
  select
    (select count(*) from lit)::int as total_lit,
    (select count(*) from classified where not dropped)::int as active_lit,
    (select count(*) from classified where dropped)::int as dropped_lit,
    round(100.0 * (select count(*) from classified where dropped) / nullif((select count(*) from classified), 0), 1) as dropout_pct,
    c.member_id,
    am.name as member_name,
    c.first_attended,
    c.last_attended
  from classified c
  join public.attendance_members am on am.id = c.member_id
  where c.dropped
  order by c.last_attended desc nulls last;
$$;

-- ─── 6. get_monthly_trend(subgroup_id, year) ───────────────────────────────────
create or replace function public.get_monthly_trend(
  p_subgroup_id uuid,
  p_year        integer
)
returns table (
  month          integer,
  month_label    text,
  total_meetings integer,
  attendance_pct numeric
)
language sql
stable
as $$
  with months as (
    select generate_series(1, 12) as month
  ),
  scoped as (
    select extract(month from m.date)::int as month, r.status
    from public.attendance_records r
    join public.attendance_meetings m on m.id = r.meeting_id
    where m.subgroup_id = p_subgroup_id
      and extract(year from m.date) = p_year
  ),
  agg as (
    select
      month,
      count(*)::int as total_meetings,
      round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1) as attendance_pct
    from scoped
    group by month
  )
  select
    mo.month,
    to_char(to_date(mo.month::text, 'MM'), 'Mon') as month_label,
    coalesce(a.total_meetings, 0) as total_meetings,
    a.attendance_pct
  from months mo
  left join agg a on a.month = mo.month
  order by mo.month;
$$;

-- ─── 7. get_yoy_comparison(meeting_type) ───────────────────────────────────────
-- Year-over-year attendance % for a single meeting type (no cross-type compare).
create or replace function public.get_yoy_comparison(
  p_meeting_type text
)
returns table (
  year           integer,
  total_meetings integer,
  attendance_pct numeric
)
language sql
stable
as $$
  select
    extract(year from m.date)::int as year,
    count(*)::int as total_meetings,
    round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*), 0), 1) as attendance_pct
  from public.attendance_records r
  join public.attendance_meetings m on m.id = r.meeting_id
  where m.type = p_meeting_type
  group by year
  order by year;
$$;

grant execute on function public.get_member_attendance_rate(uuid, text)   to authenticated;
grant execute on function public.get_consecutive_absences(uuid)           to authenticated;
grant execute on function public.get_subgroup_ranking(text, text)         to authenticated;
grant execute on function public.get_role_attendance_breakdown(uuid)      to authenticated;
grant execute on function public.get_lit_dropout_rate(text)               to authenticated;
grant execute on function public.get_monthly_trend(uuid, integer)         to authenticated;
grant execute on function public.get_yoy_comparison(text)                 to authenticated;
