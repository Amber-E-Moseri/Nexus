-- Re-create subgroup ranking RPC with the exact frontend parameter names.
-- This addresses environments where the original attendance trends migration
-- was missed or the function drifted out of sync with the client call.

create or replace function public.get_subgroup_ranking(
  p_meeting_type text default null,
  p_period text default 'month'
)
returns table (
  subgroup_id uuid,
  subgroup_name text,
  total_meetings integer,
  attendance_pct numeric,
  rank integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_meeting_type_column text;
begin
  if coalesce(auth.jwt() ->> 'user_role', '') not in ('super_admin', 'dept_lead', 'pastor') then
    return;
  end if;

  select case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attendance_meetings'
        and column_name = 'type'
    ) then 'type'
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'attendance_meetings'
        and column_name = 'meeting_type'
    ) then 'meeting_type'
    else null
  end
  into v_meeting_type_column;

  if v_meeting_type_column is null then
    return;
  end if;

  return query execute format($sql$
    with bounds as (
      select case $2
        when 'quarter' then date_trunc('quarter', current_date)
        when 'year' then date_trunc('year', current_date)
        when 'all' then '0001-01-01'::date
        else date_trunc('month', current_date)
      end::date as start_date
    ),
    scoped as (
      select
        r.status,
        m.subgroup_id
      from public.attendance_records r
      join public.attendance_meetings m on m.id = r.meeting_id
      cross join bounds b
      where ($1 is null or m.%I = $1)
        and m.date >= b.start_date
        and m.subgroup_id is not null
    ),
    aggregated as (
      select
        subgroup_id,
        count(*)::int as total_meetings,
        round(
          100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0),
          1
        ) as attendance_pct
      from scoped
      group by subgroup_id
    )
    select
      agg.subgroup_id,
      sg.name as subgroup_name,
      agg.total_meetings,
      agg.attendance_pct,
      rank() over (
        order by agg.attendance_pct desc nulls last, agg.total_meetings desc, sg.name asc
      )::int as rank
    from aggregated agg
    join public.attendance_subgroups sg on sg.id = agg.subgroup_id
    order by rank, subgroup_name
  $sql$, v_meeting_type_column)
  using p_meeting_type, p_period;
end;
$$;

grant execute on function public.get_subgroup_ranking(text, text) to authenticated;
